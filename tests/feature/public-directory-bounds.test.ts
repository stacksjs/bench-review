import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import courtHouseIndex from '../../app/Actions/CourtHouses/CourtHouseIndexAction'
import judgeIndex from '../../app/Actions/Judges/JudgeIndexAction'
import judgeSearch from '../../app/Actions/Judges/JudgeSearchAction'
import { openTestDatabase } from '../helpers/database'

/**
 * The public directory endpoints are bounded — bench-review#56.
 *
 * `/judges`, `/judges/search` and `/court-houses` are unauthenticated, and all
 * three used to materialise whole tables per request: `Judge.all()` plus
 * `CourtHouse.all()`, ~2,940 ORM model instances, even for a typeahead that
 * returns at most 20 rows and fires on every debounced keystroke. That is a
 * DoS amplifier anyone can reach with curl and an unmetered scrape of the
 * judge directory.
 *
 * The throttles were already on the routes; this covers the queries.
 */

const COURT = 7700

function seed(judgeCount: number): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM court_houses')
  raw.run(
    'INSERT INTO court_houses (id, name, city, state, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [COURT, 'District Court, D. Testing', 'Testville', 'TS'],
  )
  // A second courthouse with a state but no city — the shape most federal
  // appellate courts in the real import have.
  raw.run(
    'INSERT INTO court_houses (id, name, city, state, created_at) VALUES (?, ?, NULL, ?, datetime(\'now\'))',
    [COURT + 1, 'Court of Appeals for the Test Circuit', 'DC'],
  )
  for (let i = 0; i < judgeCount; i++) {
    raw.run(
      'INSERT INTO judges (name, court_house_id, uuid, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
      [`Judge Number ${i}`, i === 0 ? COURT + 1 : COURT, `jb-${i}-${Date.now()}`],
    )
  }
  raw.close()
}

async function call(action: any, fields: Record<string, unknown> = {}): Promise<any> {
  const req = {
    url: 'http://localhost:4008/api/judges',
    method: 'GET',
    params: {},
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => action.handle())
  return typeof res?.json === 'function' ? await res.json() : res
}

describe('public directory endpoints are bounded', () => {
  beforeEach(() => seed(30))

  test('search returns at most 20 rows and matches on court as well as name', async () => {
    const byName = await call(judgeSearch, { q: 'Judge Number' })
    expect(byName.length).toBe(20)

    const byCourt = await call(judgeSearch, { q: 'Test Circuit' })
    expect(byCourt.length).toBe(1)
    expect(byCourt[0].court.name).toBe('Court of Appeals for the Test Circuit')
  })

  test('a wildcard-only search lists nothing rather than the whole table', async () => {
    // `%` is a LIKE wildcard, so an unstripped needle of '%' would match every
    // row — a one-character request that scans the directory.
    for (const q of ['%', '_', '%%', '\\'])
      expect(await call(judgeSearch, { q })).toEqual([])
  })

  test('search still finds a name containing a stripped wildcard character', async () => {
    const raw = openTestDatabase()
    raw.run('INSERT INTO judges (name, court_house_id, uuid, created_at) VALUES (?, ?, ?, datetime(\'now\'))', ['Per Centsworth', COURT, `pc-${Date.now()}`])
    raw.close()

    const hits = await call(judgeSearch, { q: 'Cent%sworth' })
    expect(hits.map((h: any) => h.name)).toContain('Per Centsworth')
  })

  test('search finds nothing for a needle that matches nothing', async () => {
    expect(await call(judgeSearch, { q: 'zzz-no-such-judge' })).toEqual([])
  })

  test('the index hydrates the courthouse without a second whole-table read', async () => {
    const rows = await call(judgeIndex)
    expect(rows).toHaveLength(30)

    const joined = rows.find((r: any) => r.court.name === 'District Court, D. Testing')
    expect(joined.court.id).toBe(COURT)
    expect(joined.location).toBe('Testville, TS')
  })

  test('a courthouse with a state but no city does not render a leading comma', async () => {
    const rows = await call(judgeIndex)
    const appellate = rows.find((r: any) => r.court.id === COURT + 1)

    // It used to concatenate unconditionally and produce ", DC".
    expect(appellate.location).toBe('DC')
    expect(rows.every((r: any) => !r.location.startsWith(','))).toBe(true)
  })

  test('a judge with no courthouse still comes back, with the unknown-court placeholder', async () => {
    const raw = openTestDatabase()
    raw.run('INSERT INTO judges (name, court_house_id, uuid, created_at) VALUES (?, NULL, ?, datetime(\'now\'))', ['Orphan Judge', `oj-${Date.now()}`])
    raw.close()

    const rows = await call(judgeIndex)
    const orphan = rows.find((r: any) => r.name === 'Orphan Judge')
    // A LEFT JOIN is load-bearing here: an inner join would silently drop them.
    expect(orphan).toBeDefined()
    expect(orphan.court).toEqual({ id: null, name: 'Unknown court', image: null })
    expect(orphan.location).toBe('')
  })

  test('the courthouse index still carries the fields the directory reads', async () => {
    const rows = await call(courtHouseIndex)
    expect(rows.length).toBe(2)
    const row = rows.find((r: any) => r.id === COURT)
    // Spread verbatim into the response; components read these off it.
    for (const key of ['name', 'city', 'state', 'address', 'zip_code', 'active_judges', 'total_reviews', 'avg_rating'])
      expect(row).toHaveProperty(key)
    expect(row.active_judges).toBe(29)
  })
})
