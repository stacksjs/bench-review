import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import submitAction from '../../app/Actions/Judges/SubmitJudgeSubmissionAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Public judge suggestions — bench-review#48.
 *
 * The form, the endpoint and the admin queue all exist; what was missing was
 * anything that fails when the chain breaks. The failure mode this guards
 * against is the one the issue was filed for: a submission that returns 201
 * and lands nowhere, which is worse than a visibly broken form because the
 * person who filled it in believes they helped.
 *
 * The moderator alert is deliberately NOT asserted here. It is fired without
 * being awaited, by design — the row is saved and the submitter is owed
 * their 201 whether or not SMTP is reachable — so a test that waited on it
 * would be testing a race rather than the contract.
 */

function clearSubmissions(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_submissions')
  raw.close()
}

function rows(): Array<Record<string, any>> {
  const raw = openTestDatabase()
  const out = raw.query('SELECT judge_name, court, submitter_email, status FROM judge_submissions ORDER BY id').all() as Array<Record<string, any>>
  raw.close()
  return out
}

async function submit(body: Record<string, unknown>): Promise<{ status: number, body: any }> {
  const req = {
    url: 'http://localhost:4008/api/judges/submit',
    method: 'POST',
    query: body,
    get: (k: string) => (body as any)[k],
    all: () => body,
  }
  const res: any = await runWithRequest(req as any, () => (submitAction as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let parsed: any = null
  try { parsed = typeof res?.json === 'function' ? await res.json() : res }
  catch { parsed = res }
  return { status, body: parsed }
}

const VALID = {
  judgeName: 'Marsha J. Pechman',
  court: 'W.D. Wash.',
  submitterEmail: 'Tipster@Example.TEST',
  city: 'Seattle',
  state: 'WA',
  bio: 'Senior district judge.',
  sourceUrl: 'https://example.gov/pechman',
  submitterRole: 'attorney',
}

describe('judge submission', () => {
  beforeEach(() => { clearSubmissions() })

  test('a valid submission persists a PENDING row', async () => {
    const res = await submit({ ...VALID })
    expect(res.status).toBe(201)

    const saved = rows()
    expect(saved).toHaveLength(1)
    expect(saved[0].judge_name).toBe('Marsha J. Pechman')
    expect(saved[0].court).toBe('W.D. Wash.')
    // Pending is the whole point: nothing a stranger types reaches the
    // directory without a moderator.
    expect(saved[0].status).toBe('pending')
  })

  test('the contact address is normalised, so the same person is one person', async () => {
    await submit({ ...VALID })
    expect(rows()[0].submitter_email).toBe('tipster@example.test')
  })

  test('refuses what it cannot act on, and writes nothing', async () => {
    expect((await submit({ ...VALID, judgeName: 'x' })).status).toBe(422)
    expect((await submit({ ...VALID, court: '' })).status).toBe(422)
    expect((await submit({ ...VALID, submitterEmail: 'not-an-address' })).status).toBe(422)
    expect((await submit({})).status).toBe(422)

    expect(rows()).toEqual([])
  })

  test('stores hostile input as data, never as markup', async () => {
    // These reach a moderator's browser in the admin queue. The queue renders
    // them as text and only links an http(s) source; this half of the
    // contract is that the raw bytes survive, unmangled, for a human to judge.
    const nasty = {
      ...VALID,
      judgeName: '<img src=x onerror=alert(1)>',
      sourceUrl: 'javascript:alert(document.domain)',
    }
    expect((await submit(nasty)).status).toBe(201)

    const raw = openTestDatabase()
    const row = raw.query('SELECT judge_name, source_url FROM judge_submissions').get() as { judge_name: string, source_url: string }
    raw.close()

    expect(row.judge_name).toBe('<img src=x onerror=alert(1)>')
    expect(row.source_url).toBe('javascript:alert(document.domain)')
  })

  test('accepts repeat submissions rather than silently collapsing them', async () => {
    await submit({ ...VALID })
    await submit({ ...VALID })
    // Two people suggesting the same judge is signal, not an error — the
    // moderator decides. Nothing here should dedupe on their behalf.
    expect(rows()).toHaveLength(2)
  })
})

describe('judge submission route', () => {
  // The throttle lives in route middleware, so an action-level test cannot
  // exercise it — this asserts the DECLARATION, which is what would silently
  // disappear in a refactor. Behavioural coverage needs a request through the
  // real router stack and belongs with a running API.
  test('is rate limited', async () => {
    const routes = await Bun.file('routes/api.ts').text()
    const block = routes.slice(routes.indexOf('/judges/submit'), routes.indexOf('/judges/submit') + 400)
    expect(block).toContain('throttle:')
  })
})
