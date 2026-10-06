#!/usr/bin/env bun
/**
 * Federal judge + court ingestion from CourtListener bulk data.
 *
 * Usage:
 *   bun scripts/ingest-courtlistener.ts --dry-run     # report, write nothing
 *   bun scripts/ingest-courtlistener.ts               # upsert into the database
 *   bun scripts/ingest-courtlistener.ts --snapshot=2026-09-30
 *   bun scripts/ingest-courtlistener.ts --refresh      # re-download cached CSVs
 *
 * ## Why bulk CSV and not the REST API
 *
 * The obvious route — `GET /api/rest/v4/people/` — does not work for this:
 *
 *   - it returns **401 anonymously**; judge data needs an API token, so the
 *     ingest would depend on a per-developer secret
 *   - authenticated quotas are documented at 5 requests/minute, 50/hour and
 *     **125/day**. There are ~2,700 sitting federal judges across ~200 courts;
 *     paginating that plus their positions would take weeks of quota
 *
 * The quarterly bulk exports have neither problem: public, unauthenticated,
 * and the four tables this needs total about 1.6 MB compressed. `courts` is
 * also available anonymously over the API, but is taken from bulk here so the
 * whole ingest comes from one internally-consistent snapshot.
 *
 * ## What this does and does not populate
 *
 * `judges` comes out well: 2,700+ sitting judges, each attached to a real
 * court.
 *
 * `court_houses` comes out NAME-ONLY, and that is a limitation of the source,
 * not of this script. Neither the API's `courts` endpoint nor the bulk
 * `courthouses` table carries usable location data:
 *
 *   - `courts` has no address fields at all (name, citation string, website,
 *     jurisdiction, PACER ids, dates)
 *   - `courthouses` has address columns, but they are essentially unpopulated:
 *     of the 325 rows attached to an in-use federal court, exactly **1** has a
 *     street address. All the rest carry only a two-letter `state`
 *   - neither table has latitude/longitude anywhere
 *
 * So courthouse rows land with `name` and `state` and nothing else. That
 * degrades safely — `Bench/Court/CourtProfile.stx` guards the Leaflet map
 * behind a `hasCoords` derived and its init bails on non-finite coordinates, so
 * the map section is simply absent rather than broken. Filling in addresses and
 * coordinates needs a second source (GSA's federal building inventory, or
 * Wikidata courthouse coordinates) and is deliberately out of scope here:
 * guessing a courthouse location would put a map pin on the wrong building,
 * which is worse than no pin.
 *
 * ## Judge portraits
 *
 * `people.has_photo` is true for 524 of the sitting judges, but CourtListener
 * publishes no documented URL pattern for those images (the plausible
 * judge-pics paths all 404 or 403 — verified). Rather than guess, every judge
 * gets the same deterministic initials avatar the existing `JudgeSeeder` uses.
 * A wrong guess here attaches a real person's face to a different named judge
 * on a page carrying public criticism of them, so a placeholder is the only
 * defensible default.
 *
 * ## Idempotency
 *
 * Courts key on `name`, judges on `(name, court_house_id)`. Re-running adds
 * only what is missing, so this is safe to run after each quarterly snapshot.
 * Nothing is updated or deleted: a judge who leaves the bench is not removed,
 * because this script cannot tell "left the bench" from "absent from this
 * export", and silently dropping a judge would also orphan reviews written
 * about them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { db } from '@stacksjs/database'

const BUCKET = 'https://com-courtlistener-storage.s3-us-west-2.amazonaws.com'
const CACHE = resolve(process.cwd(), 'storage/courtlistener')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const REFRESH = args.includes('--refresh')
const SNAPSHOT_ARG = args.find(a => a.startsWith('--snapshot='))?.split('=')[1]

/**
 * Jurisdiction codes that count as federal.
 *
 * F = federal appellate (includes SCOTUS), FD = federal district,
 * FB / FBP = bankruptcy, FS = federal special (Tax, Claims, Veterans),
 * MA = military appellate, C = committee. State codes (ST, SA, SS, S...) are
 * excluded — state coverage has no single feed and is a separate project.
 */
const FEDERAL_JURISDICTIONS = new Set(['F', 'FD', 'FB', 'FBP', 'FS', 'MA', 'C'])

/**
 * Position types that make somebody a judge for our purposes.
 *
 * Deliberately excludes `clerk`, `prac` (private practice) and the various
 * `ret-*` retired types: a clerk is not a judge, and a retired judge is not
 * someone you can appear before. `mag` (magistrate) and `spec-m` (special
 * master) are included — litigants do appear before them.
 */
const JUDICIAL_POSITION_TYPES = new Set([
  'jud',
  'c-jud',
  'chief-judge',
  'jus',
  'c-jus',
  'ass-jus',
  'act-jud',
  'pres-jud',
  'mag',
  'c-mag',
  'spec-m',
])

/**
 * `judges.practice_area` is a CHECK-constrained enum
 * (criminal/civil/family/probate/appellate/bankruptcy/other), so the mapping
 * has to land inside it.
 *
 * Appellate and bankruptcy map cleanly. District judges do NOT: they hear both
 * criminal and civil matters, so any specialty we picked would be invented.
 * They get `other`.
 *
 * This is really "court type" wearing "practice area"'s clothes. The honest fix
 * is a separate `court_level` column on judges rather than overloading this
 * enum — worth doing before the directory's filter pills lean on it, since
 * ~1,980 of ~2,730 judges land in `other` under this mapping.
 */
const PRACTICE_AREA: Record<string, string> = {
  F: 'appellate',
  MA: 'appellate',
  FB: 'bankruptcy',
  FBP: 'bankruptcy',
  FD: 'other',
  FS: 'other',
  C: 'other',
}

const SUFFIXES: Record<string, string> = { jr: 'Jr.', sr: 'Sr.', '2': 'II', '3': 'III', '4': 'IV' }

interface Row { [key: string]: string }

/**
 * RFC 4180 CSV reader.
 *
 * Hand-rolled rather than adding a dependency, but it does have to be correct:
 * these files come out of PostgreSQL's `COPY TO ... CSV`, and court names and
 * job titles contain commas, doubled quotes and embedded newlines. A
 * `split(',')` would silently shear rows apart and attach judges to the wrong
 * court.
 */
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  // A double quote only OPENS a quoted field at the start of a field. Anywhere
  // else it is a literal character. Getting this wrong is not a subtle bug:
  // `courts.notes` and `positions.job_title` contain bare quotation marks, and
  // treating one of those as an opening quote puts the reader into quoted mode,
  // where it then swallows every following comma and newline. That silently
  // collapsed 3,380 courts into 102 and lost 1,976 positions — rows did not
  // error, they merged into their neighbours.
  let atFieldStart = true

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          quoted = false
          atFieldStart = false
        }
      }
      else {
        field += char
      }
      continue
    }

    if (char === '"' && atFieldStart) {
      quoted = true
      atFieldStart = false
    }
    else if (char === ',') {
      record.push(field)
      field = ''
      atFieldStart = true
    }
    else if (char === '\n' || char === '\r') {
      // Close the record on LF, or on the CR of a CRLF pair.
      if (char === '\r' && text[i + 1] === '\n')
        i++
      record.push(field)
      field = ''
      atFieldStart = true
      if (record.length > 1 || record[0] !== '')
        rows.push(record)
      record = []
    }
    else {
      field += char
      atFieldStart = false
    }
  }
  if (field !== '' || record.length)
    record.push(field)
  if (record.length)
    rows.push(record)

  const header = rows.shift()
  if (!header)
    return []
  return rows.map((cells) => {
    const row: Row = {}
    header.forEach((key, idx) => { row[key] = cells[idx] ?? '' })
    return row
  })
}

/** Newest snapshot date present in the bucket. */
async function discoverSnapshot(): Promise<string> {
  const dates = new Set<string>()
  let token: string | undefined

  for (let page = 0; page < 20; page++) {
    const url = `${BUCKET}/?list-type=2&prefix=bulk-data/&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const xml = await fetch(url).then(r => r.text())
    for (const match of xml.matchAll(/<Key>bulk-data\/[^<]*?(\d{4}-\d{2}-\d{2})[^<]*<\/Key>/g))
      dates.add(match[1])
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    if (!next)
      break
    token = next[1]
  }

  const sorted = [...dates].sort()
  if (!sorted.length)
    throw new Error('Could not list the CourtListener bulk-data bucket.')
  return sorted[sorted.length - 1]
}

/**
 * Download (and cache) one bulk table, returning its parsed rows.
 *
 * bzip2 is decompressed by shelling out: Bun ships gzip and zstd but no bzip2,
 * and these files are only published as .bz2.
 */
async function table(name: string, snapshot: string): Promise<Row[]> {
  mkdirSync(CACHE, { recursive: true })
  const csvPath = join(CACHE, `${name}-${snapshot}.csv`)

  if (!existsSync(csvPath) || REFRESH) {
    const archive = join(CACHE, `${name}-${snapshot}.csv.bz2`)
    if (!existsSync(archive) || REFRESH) {
      const url = `${BUCKET}/bulk-data/${name}-${snapshot}.csv.bz2`
      process.stdout.write(`  downloading ${name} … `)
      const res = await fetch(url)
      if (!res.ok)
        throw new Error(`${url} returned ${res.status}`)
      writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
      process.stdout.write('ok\n')
    }

    const proc = Bun.spawn(['bunzip2', '-dc', archive], { stdout: 'pipe', stderr: 'pipe' })
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    if (await proc.exited !== 0)
      throw new Error(`bunzip2 failed on ${archive}. Is bzip2 installed?\n${err}`)
    writeFileSync(csvPath, out)
  }

  return parseCsv(readFileSync(csvPath, 'utf8'))
}

/** "Robert P. Young jr" -> "Robert P. Young Jr." */
function judgeName(person: Row): string {
  const suffix = SUFFIXES[(person.name_suffix || '').toLowerCase()] ?? ''
  return [person.name_first, person.name_middle, person.name_last, suffix]
    .map(part => (part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
}

/**
 * Deterministic initials avatar — always renders, and reads as a placeholder
 * rather than as a misattributed photograph. Same helper the hand-written
 * JudgeSeeder uses, kept identical so seeded and ingested judges look alike.
 */
function avatar(name: string): string {
  const clean = name.replace(/^Hon\.\s*/, '').replace(/\s+(?:Jr\.|Sr\.|III|II|IV)$/, '')
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&size=256&background=1f2937&color=ffffff&bold=true`
}

async function main(): Promise<void> {
  const snapshot = SNAPSHOT_ARG ?? await discoverSnapshot()
  console.log(`CourtListener snapshot: ${snapshot}${SNAPSHOT_ARG ? ' (pinned)' : ' (latest)'}`)
  if (DRY_RUN)
    console.log('DRY RUN — nothing will be written\n')

  const [courts, courthouses, people, positions] = await Promise.all([
    table('courts', snapshot),
    table('courthouses', snapshot),
    table('people-db-people', snapshot),
    table('people-db-positions', snapshot),
  ])
  console.log(`  parsed ${courts.length} courts, ${courthouses.length} courthouses, ${people.length} people, ${positions.length} positions\n`)

  // ── Courts in scope ──────────────────────────────────────────────────
  const federalCourts = new Map<string, Row>()
  for (const court of courts) {
    if (FEDERAL_JURISDICTIONS.has(court.jurisdiction) && court.in_use === 't')
      federalCourts.set(court.id, court)
  }

  // Only ever one state per court here, so last-wins is harmless.
  const stateByCourt = new Map<string, string>()
  for (const house of courthouses) {
    const state = (house.state || '').trim()
    if (state && federalCourts.has(house.court_id))
      stateByCourt.set(house.court_id, state)
  }

  // ── Judges in scope ──────────────────────────────────────────────────
  const peopleById = new Map(people.map(p => [p.id, p]))
  const seats: Array<{ person: Row, court: Row }> = []
  const seen = new Set<string>()

  for (const position of positions) {
    if (!federalCourts.has(position.court_id))
      continue
    if (!JUDICIAL_POSITION_TYPES.has(position.position_type))
      continue
    if ((position.date_termination || '').trim())
      continue // no longer sitting

    const person = peopleById.get(position.person_id)
    if (!person)
      continue
    if ((person.date_dod || '').trim())
      continue // deceased — never list them as sitting
    if ((person.is_alias_of_id || '').trim())
      continue // alias row, the canonical person is elsewhere in the file

    // A judge can hold several concurrent positions at one court
    // (e.g. `jud` plus `c-jud`); one row per judge per court.
    const key = `${position.person_id}:${position.court_id}`
    if (seen.has(key))
      continue
    seen.add(key)

    seats.push({ person, court: federalCourts.get(position.court_id)! })
  }

  const courtsWithJudges = new Set(seats.map(s => s.court.id))
  console.log(`In scope:`)
  console.log(`  federal courts in use:        ${federalCourts.size}`)
  console.log(`  …of those, with a sitting judge: ${courtsWithJudges.size}`)
  console.log(`  sitting judges (person×court): ${seats.length}`)
  console.log(`  distinct judges:              ${new Set(seats.map(s => s.person.id)).size}`)
  console.log(`  courts with a known state:    ${[...courtsWithJudges].filter(id => stateByCourt.has(id)).length}`)

  if (DRY_RUN) {
    console.log('\nSample of what would be written:')
    for (const seat of seats.slice(0, 8)) {
      const court = seat.court
      console.log(`  ${judgeName(seat.person).padEnd(32)} ${(PRACTICE_AREA[court.jurisdiction] ?? 'other').padEnd(11)} ${court.full_name.slice(0, 46)}`)
    }
    return
  }

  // ── Upsert courthouses ───────────────────────────────────────────────
  const existingCourts = await db.selectFrom('court_houses' as any).select(['id', 'name'] as any).execute() as Array<{ id: number, name: string }>
  const courtIdByName = new Map(existingCourts.map(c => [c.name, Number(c.id)]))

  let insertedCourts = 0
  for (const id of courtsWithJudges) {
    const court = federalCourts.get(id)!
    const name = court.full_name || court.short_name
    if (!name || courtIdByName.has(name))
      continue

    const inserted = await db.insertInto('court_houses' as any).values({
      name,
      // Left null on purpose — see the header note. The source has no street
      // address, city, zip or coordinates for federal courts.
      image: null,
      address: null,
      city: null,
      state: stateByCourt.get(id) ?? null,
      zip_code: null,
      latitude: null,
      longitude: null,
      uuid: crypto.randomUUID(),
    } as any).returning(['id'] as any).executeTakeFirst() as { id: number } | undefined

    if (inserted?.id) {
      courtIdByName.set(name, Number(inserted.id))
      insertedCourts++
    }
  }

  // ── Upsert judges ────────────────────────────────────────────────────
  const existingJudges = await db.selectFrom('judges' as any).select(['name', 'court_house_id'] as any).execute() as Array<{ name: string, court_house_id: number }>
  const judgeKeys = new Set(existingJudges.map(j => `${j.name}:${j.court_house_id}`))

  let insertedJudges = 0
  let skippedNoCourt = 0
  for (const seat of seats) {
    const courtName = seat.court.full_name || seat.court.short_name
    const courtHouseId = courtIdByName.get(courtName)
    if (!courtHouseId) {
      skippedNoCourt++
      continue
    }

    const name = judgeName(seat.person)
    if (!name)
      continue
    const key = `${name}:${courtHouseId}`
    if (judgeKeys.has(key))
      continue
    judgeKeys.add(key)

    await db.insertInto('judges' as any).values({
      name,
      image_url: avatar(name),
      practice_area: PRACTICE_AREA[seat.court.jurisdiction] ?? 'other',
      court_house_id: courtHouseId,
      uuid: crypto.randomUUID(),
    } as any).execute()
    insertedJudges++
  }

  console.log(`\nWrote:`)
  console.log(`  court_houses inserted: ${insertedCourts}`)
  console.log(`  judges inserted:       ${insertedJudges}`)
  if (skippedNoCourt)
    console.log(`  judges skipped (no courthouse row): ${skippedNoCourt}`)

  const totals = {
    court_houses: await db.selectFrom('court_houses' as any).select(db.fn.count('id' as any).as('n') as any).executeTakeFirst() as any,
    judges: await db.selectFrom('judges' as any).select(db.fn.count('id' as any).as('n') as any).executeTakeFirst() as any,
  }
  console.log(`\nTable totals: court_houses=${totals.court_houses?.n}, judges=${totals.judges?.n}`)
  console.log('\nNext: `bun run build` to pre-render the new entity pages, then `bun gate.ts`.')
}

await main()
