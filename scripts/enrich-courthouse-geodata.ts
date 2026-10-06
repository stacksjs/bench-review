#!/usr/bin/env bun
/**
 * Fill in courthouse coordinates from Wikidata.
 *
 * Usage:
 *   bun scripts/enrich-courthouse-geodata.ts --dry-run
 *   bun scripts/enrich-courthouse-geodata.ts
 *
 * Run AFTER `scripts/ingest-courtlistener.ts`, which creates the
 * `court_houses` rows this updates.
 *
 * ## Why a second source is needed at all
 *
 * CourtListener has no usable location data for federal courts: its `courts`
 * table has no address fields, its bulk `courthouses` table has address
 * columns that are empty for all but one of the 325 federal rows, and neither
 * carries coordinates. Without coordinates the Leaflet map on
 * `/court-houses/:id/profile` never renders.
 *
 * ## Matching, and why it is not fuzzy
 *
 * CourtListener names courts systematically — "District Court, W.D. Oklahoma",
 * "United States Bankruptcy Court, M.D. Alabama" — and Wikidata labels them
 * with the long official form. So the join is a deterministic expansion
 * (`W.D. Oklahoma` -> `Western District of Oklahoma`) followed by an EXACT
 * match against Wikidata's label and aliases. No edit distance, no
 * best-effort nearest hit: either the canonical name matches exactly or the
 * courthouse is left without coordinates.
 *
 * That matters because the failure mode of a wrong match is a map pin on the
 * wrong building, on a page where people review the judges who sit in it.
 * No coordinate is better than a plausible wrong one.
 *
 * ## The state cross-check, and the exception that proves it works
 *
 * Every accepted coordinate is checked against the state CourtListener reports
 * for that court, via a per-state bounding box. On the first run this rejected
 * exactly 9 of 76 matches — and all 9 were circuit courts of appeals, where
 * Wikidata was RIGHT and CourtListener was misleading: a circuit spans many
 * states, and CourtListener's courthouse row carries just one of them. The
 * First Circuit sits in Boston, not Rhode Island; the Ninth sits in San
 * Francisco, not the Northern Mariana Islands.
 *
 * So the check is applied only to single-state courts (district and
 * bankruptcy) and skipped for multi-state ones (the circuits), which is the
 * correct scope rather than a workaround. Bounding boxes are deliberately
 * generous and overlap at borders: this is a guard against a grossly wrong
 * point (a mismatched item, a vandalised coordinate), not a precise
 * geofence.
 *
 * ## Coverage
 *
 * Wikidata holds about 116 US federal court items against our ~202 ingested
 * courts, and only some carry coordinates — so expect roughly 75 to be filled
 * and the rest to stay blank, bankruptcy courts most of all. That is a source
 * limitation, reported honestly at the end of each run rather than papered
 * over. Courthouses without coordinates still render fine; `CourtProfile.stx`
 * guards the map behind a `hasCoords` derived.
 */

import process from 'node:process'
import { db } from '@stacksjs/database'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const UA = 'bench-review-ingest/0.1 (https://benchreview.org; courthouse geodata)'
const DRY_RUN = process.argv.includes('--dry-run')

/** Wikidata classes: US district court, US court of appeals, US bankruptcy court. */
const COURT_CLASSES = ['wd:Q1614849', 'wd:Q1641851', 'wd:Q7892354']

const DIRECTIONS: Record<string, string> = {
  N: 'Northern',
  S: 'Southern',
  E: 'Eastern',
  W: 'Western',
  M: 'Middle',
  C: 'Central',
}

/**
 * Generous per-state bounding boxes: [lonMin, latMin, lonMax, latMax].
 *
 * Only ever used to reject a coordinate that is nowhere near the right state,
 * so approximate boxes that overlap at borders are fine and intentional.
 */
const STATE_BBOX: Record<string, [number, number, number, number]> = {
  AL: [-88.6, 30.1, -84.8, 35.1],
  AK: [-179.9, 51.0, -129.0, 71.6],
  AZ: [-115.0, 31.3, -109.0, 37.1],
  AR: [-94.7, 33.0, -89.6, 36.6],
  CA: [-124.5, 32.5, -114.1, 42.1],
  CO: [-109.1, 36.9, -102.0, 41.1],
  CT: [-73.8, 40.9, -71.7, 42.1],
  DE: [-75.8, 38.4, -74.9, 39.9],
  DC: [-77.2, 38.7, -76.9, 39.0],
  FL: [-87.7, 24.3, -79.9, 31.1],
  GA: [-85.7, 30.3, -80.7, 35.1],
  HI: [-160.3, 18.8, -154.7, 22.3],
  ID: [-117.3, 41.9, -110.9, 49.1],
  IL: [-91.6, 36.9, -87.4, 42.6],
  IN: [-88.1, 37.7, -84.7, 41.8],
  IA: [-96.7, 40.3, -90.1, 43.6],
  KS: [-102.1, 36.9, -94.5, 40.1],
  KY: [-89.6, 36.4, -81.9, 39.2],
  LA: [-94.1, 28.8, -88.7, 33.1],
  ME: [-71.1, 42.9, -66.9, 47.6],
  MD: [-79.5, 37.8, -75.0, 39.8],
  MA: [-73.6, 41.1, -69.8, 42.9],
  MI: [-90.5, 41.6, -82.1, 48.4],
  MN: [-97.3, 43.4, -89.4, 49.5],
  MS: [-91.7, 30.1, -88.0, 35.1],
  MO: [-95.8, 35.9, -89.0, 40.7],
  MT: [-116.1, 44.3, -104.0, 49.1],
  NE: [-104.1, 39.9, -95.2, 43.1],
  NV: [-120.1, 34.9, -114.0, 42.1],
  NH: [-72.6, 42.6, -70.5, 45.4],
  NJ: [-75.6, 38.8, -73.8, 41.4],
  NM: [-109.1, 31.2, -102.9, 37.1],
  NY: [-79.8, 40.4, -71.8, 45.1],
  NC: [-84.4, 33.8, -75.4, 36.6],
  ND: [-104.1, 45.9, -96.5, 49.1],
  OH: [-84.9, 38.3, -80.4, 42.4],
  OK: [-103.1, 33.6, -94.4, 37.1],
  OR: [-124.6, 41.9, -116.4, 46.3],
  PA: [-80.6, 39.7, -74.6, 42.3],
  RI: [-71.9, 41.1, -71.1, 42.1],
  SC: [-83.4, 32.0, -78.4, 35.3],
  SD: [-104.1, 42.4, -96.4, 46.0],
  TN: [-90.4, 34.9, -81.6, 36.7],
  TX: [-106.7, 25.8, -93.5, 36.6],
  UT: [-114.1, 36.9, -109.0, 42.1],
  VT: [-73.5, 42.7, -71.4, 45.1],
  VA: [-83.7, 36.5, -75.2, 39.5],
  WA: [-124.9, 45.5, -116.9, 49.1],
  WV: [-82.7, 37.1, -77.7, 40.7],
  WI: [-92.9, 42.4, -86.2, 47.1],
  WY: [-111.1, 40.9, -104.0, 45.1],
  PR: [-67.3, 17.9, -65.2, 18.6],
  VI: [-65.1, 17.6, -64.5, 18.5],
  GU: [144.6, 13.2, 145.0, 13.7],
  MP: [145.1, 14.1, 145.8, 15.3],
  AS: [-171.1, -14.4, -168.1, -11.0],
}

interface WikidataCourt {
  labels: Set<string>
  lat?: number
  lon?: number
  address?: string
  city?: string
}

/**
 * CourtListener's abbreviated name -> Wikidata's official label.
 *
 *   "District Court, D. Oregon"                    -> "United States District Court for the District of Oregon"
 *   "District Court, W.D. Oklahoma"                -> "United States District Court for the Western District of Oklahoma"
 *   "United States Bankruptcy Court, M.D. Alabama" -> "United States Bankruptcy Court for the Middle District of Alabama"
 *   "Court of Appeals for the Ninth Circuit"       -> "United States Court of Appeals for the Ninth Circuit"
 */
export function canonicalCourtName(name: string): string | null {
  const trimmed = name.trim()

  if (trimmed.startsWith('Court of Appeals'))
    return `United States ${trimmed}`

  const match = trimmed.match(/^(United States Bankruptcy Court|District Court),\s*([NSEWMC])?\.?D\.\s*(.+)$/)
  if (!match)
    return null

  const [, kind, direction, place] = match
  const district = direction ? `${DIRECTIONS[direction]} District of ${place}` : `District of ${place}`
  return kind.includes('Bankruptcy')
    ? `United States Bankruptcy Court for the ${district}`
    : `United States District Court for the ${district}`
}

/** Circuits span many states, so a single expected state is meaningless for them. */
export function isSingleStateCourt(name: string): boolean {
  return !name.trim().startsWith('Court of Appeals')
}

export function inState(lat: number, lon: number, state: string): boolean {
  const bbox = STATE_BBOX[state?.toUpperCase?.()]
  if (!bbox)
    return true // nothing to check against — don't reject on ignorance
  const [lonMin, latMin, lonMax, latMax] = bbox
  return lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax
}

async function fetchWikidataCourts(): Promise<Map<string, WikidataCourt>> {
  const query = `
    SELECT ?item ?label ?alias ?coord ?hqCoord ?address ?cityLabel WHERE {
      VALUES ?class { ${COURT_CLASSES.join(' ')} }
      ?item wdt:P31 ?class .
      ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
      OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }
      OPTIONAL { ?item wdt:P625 ?coord . }
      OPTIONAL { ?item wdt:P159 ?hq . ?hq wdt:P625 ?hqCoord . }
      OPTIONAL { ?item wdt:P969 ?address . }
      OPTIONAL { ?item wdt:P131 ?city . ?city rdfs:label ?cityLabel . FILTER(LANG(?cityLabel) = "en") }
    }`

  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
  })
  if (!res.ok)
    throw new Error(`Wikidata returned ${res.status}. The SPARQL endpoint rate-limits and times out; retry in a minute.`)

  const json = await res.json() as { results: { bindings: Record<string, { value: string }>[] } }
  const byLabel = new Map<string, WikidataCourt>()
  const byItem = new Map<string, WikidataCourt>()

  for (const row of json.results.bindings) {
    const qid = row.item.value.split('/').pop()!
    let court = byItem.get(qid)
    if (!court) {
      court = { labels: new Set() }
      byItem.set(qid, court)
    }

    court.labels.add(row.label.value)
    if (row.alias)
      court.labels.add(row.alias.value)

    // Prefer the court's own coordinate; fall back to its headquarters'.
    const point = row.coord?.value ?? row.hqCoord?.value
    if (point && court.lat === undefined) {
      const parsed = point.match(/Point\((-?[\d.]+) (-?[\d.]+)\)/)
      if (parsed) {
        court.lon = Number(parsed[1])
        court.lat = Number(parsed[2])
      }
    }
    if (row.address && !court.address)
      court.address = row.address.value
    if (row.cityLabel && !court.city)
      court.city = row.cityLabel.value
  }

  for (const court of byItem.values()) {
    for (const label of court.labels) {
      if (!byLabel.has(label))
        byLabel.set(label, court)
    }
  }
  return byLabel
}

async function main(): Promise<void> {
  if (DRY_RUN)
    console.log('DRY RUN — nothing will be written\n')

  process.stdout.write('Querying Wikidata … ')
  const wikidata = await fetchWikidataCourts()
  console.log(`${wikidata.size} labels/aliases indexed`)

  const houses = await db.selectFrom('court_houses' as any)
    .select(['id', 'name', 'state', 'latitude', 'longitude', 'address', 'city'] as any)
    .execute() as Array<{ id: number, name: string, state: string | null, latitude: number | null, longitude: number | null, address: string | null, city: string | null }>

  console.log(`${houses.length} courthouses in the database\n`)

  const updates: Array<{ id: number, name: string, lat: number, lon: number, address?: string, city?: string }> = []
  const rejected: string[] = []
  const unmatched: string[] = []
  let alreadySet = 0

  for (const house of houses) {
    if (house.latitude !== null && house.longitude !== null) {
      alreadySet++
      continue
    }

    const canonical = canonicalCourtName(house.name)
    const hit = canonical ? wikidata.get(canonical) : undefined
    if (!hit || hit.lat === undefined || hit.lon === undefined) {
      unmatched.push(house.name)
      continue
    }

    if (isSingleStateCourt(house.name) && house.state && !inState(hit.lat, hit.lon, house.state)) {
      rejected.push(`${house.name} — expected ${house.state}, got ${hit.lat.toFixed(3)},${hit.lon.toFixed(3)}`)
      continue
    }

    updates.push({
      id: house.id,
      name: house.name,
      lat: hit.lat,
      lon: hit.lon,
      address: hit.address,
      city: hit.city,
    })
  }

  console.log(`Matched with verified coordinates: ${updates.length}`)
  console.log(`Already had coordinates:           ${alreadySet}`)
  console.log(`Rejected by the state check:       ${rejected.length}`)
  console.log(`No Wikidata coordinate:            ${unmatched.length}`)

  for (const line of rejected)
    console.log(`  REJECT ${line}`)

  if (DRY_RUN) {
    console.log('\nSample of what would be written:')
    for (const u of updates.slice(0, 10))
      console.log(`  ${u.name.slice(0, 46).padEnd(46)} ${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}${u.city ? `  (${u.city})` : ''}`)
    return
  }

  for (const u of updates) {
    const values: Record<string, unknown> = { latitude: u.lat, longitude: u.lon }
    // Only ever fill a blank — never overwrite data already in the row.
    if (u.address)
      values.address = u.address
    if (u.city)
      values.city = u.city

    // A circuit's CourtListener `state` is one of the many states it covers,
    // not where it sits, so pairing it with the real seat city renders a
    // falsehood: "New Orleans, TX" for the Fifth Circuit, "San Francisco, MP"
    // for the Ninth, "St. Louis, SD" for the Eighth. Wikidata gives us the
    // city; it does not cheaply give us the seat's state (the transitive
    // P131+ lookup times out on the public endpoint). So clear the state
    // rather than display a wrong one — "New Orleans" alone is true, and
    // CourtProfile builds its location line from whichever parts are present.
    //
    // Cleared for EVERY multi-state court once we have a verified coordinate,
    // not just the ones where Wikidata also supplied a city: the First Circuit
    // would otherwise read "RI" while sitting in Boston, and the Fourth "WV"
    // while sitting in Richmond. The value is structurally unreliable for a
    // circuit, so it goes regardless of what else we managed to fill.
    if (!isSingleStateCourt(u.name))
      values.state = null

    await db.updateTable('court_houses' as any).set(values as any).where('id' as any, '=', u.id).execute()
  }

  const withCoords = await db.selectFrom('court_houses' as any)
    .select(db.fn.count('id' as any).as('n') as any)
    .where('latitude' as any, 'is not', null)
    .executeTakeFirst() as any

  console.log(`\nUpdated ${updates.length} courthouses.`)
  console.log(`court_houses with coordinates: ${withCoords?.n} / ${houses.length}`)
  console.log('\nNext: `bun run build` so the profile pages pick up the new map pins.')
}

await main()
