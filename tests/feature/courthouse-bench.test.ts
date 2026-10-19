import { beforeEach, describe, expect, test } from 'bun:test'
import { runWithRequest } from '@stacksjs/router'
import benchAction from '../../app/Actions/CourtHouses/CourtHouseJudgesAction'
import { openTestDatabase } from '../helpers/database'

/**
 * GET /api/court-houses/{id}/judges — bench-review#79.
 *
 * The native courthouse screen lists who sits at a courthouse. Before this
 * the only way to answer that was to pull the whole 2,000-row judge
 * directory and filter it client-side, which is what the web still does.
 */

const COURT = 9801
const EMPTY_COURT = 9802

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judges WHERE court_house_id IN (?, ?)', [COURT, EMPTY_COURT])
  raw.run('DELETE FROM court_houses WHERE id IN (?, ?)', [COURT, EMPTY_COURT])
  raw.run(
    'INSERT INTO court_houses (id, uuid, name, state, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [COURT, 'ch-bench-1', 'District Court, D. Testing', 'OR'],
  )
  raw.run(
    'INSERT INTO court_houses (id, uuid, name, state, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [EMPTY_COURT, 'ch-bench-2', 'District Court, D. Empty', 'WA'],
  )
  // Inserted out of order on purpose: the action promises alphabetical rows.
  for (const [id, name] of [[98011, 'Zoe Zimmer'], [98012, 'Alan Ash'], [98013, 'Mia Moss']] as Array<[number, string]>) {
    raw.run(
      'INSERT INTO judges (id, uuid, name, image_url, practice_area, court_house_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      [id, `j-bench-${id}`, name, `https://example.test/${id}.png`, 'other', COURT],
    )
  }
  raw.close()
}

async function invoke(id: unknown): Promise<{ status: number, body: any }> {
  const req = {
    url: `http://localhost:4008/api/court-houses/${id}/judges`,
    method: 'GET',
    params: { id },
    query: {},
    get: () => undefined,
    all: () => ({}),
  }
  const res: any = await runWithRequest(req as any, () => (benchAction as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

describe('courthouse bench', () => {
  beforeEach(() => {
    seed()
  })

  test('lists the judges who sit there, by name', async () => {
    const { status, body } = await invoke(COURT)
    expect(status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.data.map((j: any) => j.name)).toEqual(['Alan Ash', 'Mia Moss', 'Zoe Zimmer'])
  })

  test('calls the column `photo`, as every judge-shaped response does', async () => {
    // A screen hands one of these straight to the judge screen; a different
    // key there would silently drop the avatar.
    const { body } = await invoke(COURT)
    expect(body.data[0].photo).toBe('https://example.test/98012.png')
    expect(body.data[0]).not.toHaveProperty('image_url')
  })

  test('does not return judges from another courthouse', async () => {
    const { body } = await invoke(EMPTY_COURT)
    expect(body.total).toBe(0)
    expect(body.data).toEqual([])
  })

  test('404s for a courthouse that does not exist', async () => {
    // Distinct from an empty bench: "no judges here" and "no such
    // courthouse" are different answers and a caller branches on them.
    const { status, body } = await invoke(998877)
    expect(status).toBe(404)
    expect(body.error).toContain('not found')
  })

  test('422s for an id that is not a positive integer', async () => {
    for (const bad of ['abc', '-3', '0']) {
      const { status } = await invoke(bad)
      expect(status).toBe(422)
    }
  })
})
