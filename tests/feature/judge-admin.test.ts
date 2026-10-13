import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import indexAction from '../../app/Actions/Admin/Judges/JudgeIndexAction'
import mergeAction from '../../app/Actions/Admin/Judges/MergeJudgesAction'
import saveAction from '../../app/Actions/Admin/Judges/SaveJudgeAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Admin judge directory — bench-review#50.
 *
 * Merge is the part worth testing hard. It moves every review, opinion,
 * response, draft, follow and verified claim off one profile and deletes it,
 * and two unique constraints can make that impossible halfway through. A
 * merge that half-completes leaves reviews about a real judge pointing at a
 * row that no longer exists.
 */

const ADMIN_ID = 8801
const USER_A = 8802
const USER_B = 8803

function seed(): { target: number, source: number, court: number } {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_follows')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM judge_opinions')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM court_houses')
  raw.run('DELETE FROM users WHERE id IN (?, ?, ?)', [ADMIN_ID, USER_A, USER_B])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [ADMIN_ID, 'Mod', 'judge-admin-mod@example.test', USER_A, 'A', 'judge-admin-a@example.test', USER_B, 'B', 'judge-admin-b@example.test'],
  )
  raw.run('INSERT INTO court_houses (id, name, state, created_at) VALUES (1, \'E.D. Missouri\', \'MO\', datetime(\'now\'))')
  raw.run('INSERT INTO judges (id, name, slug, status, court_house_id, created_at) VALUES (1, \'Brian Curtis Wimes\', \'brian-curtis-wimes\', \'active\', 1, datetime(\'now\'))')
  raw.run('INSERT INTO judges (id, name, slug, status, court_house_id, created_at) VALUES (2, \'Brian Curtis Wimes\', \'brian-curtis-wimes-2\', \'active\', 1, datetime(\'now\'))')
  raw.close()
  return { target: 1, source: 2, court: 1 }
}

function addReview(judgeId: number, userId: number | null, status = 'published'): number {
  const raw = openTestDatabase()
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (?, ?, \'t\', \'c\', 4, ?, ?, datetime(\'now\'))',
    [judgeId, userId, status, `ja-${Date.now()}-${Math.random()}`],
  )
  const row = raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as { id: number }
  raw.close()
  return Number(row.id)
}

function addFollow(judgeId: number, userId: number): void {
  const raw = openTestDatabase()
  raw.run('INSERT INTO judge_follows (judge_id, user_id, created_at) VALUES (?, ?, datetime(\'now\'))', [judgeId, userId])
  raw.close()
}

function query(sql: string, ...args: any[]): any[] {
  const raw = openTestDatabase()
  const rows = raw.query(sql).all(...args) as any[]
  raw.close()
  return rows
}

async function invoke(action: any, fields: Record<string, unknown>, params: Record<string, string> = {}, method = 'POST'): Promise<{ status: number, body: any }> {
  const req = {
    url: 'http://localhost:4008/api/admin/judges',
    method,
    params,
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (action as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

describe('admin judge directory', () => {
  beforeEach(() => {
    seed()
    ;(Auth as any).user = async () => ({ id: ADMIN_ID })
  })

  test('creating a judge slugs the name and audits the write', async () => {
    const res = await invoke(saveAction, { name: 'Amara O\'Dell Osei', court_house_id: 1, status: 'active', jurisdiction: 'state', state: 'CA' })

    expect(res.status).toBe(201)
    expect(res.body?.slug).toBe('amara-odell-osei')
    const [row] = query('SELECT name, slug, status, jurisdiction, state FROM judges WHERE id = ?', res.body.id)
    expect(row.jurisdiction).toBe('state')
    const [log] = query('SELECT action, target_type FROM moderation_logs ORDER BY id DESC LIMIT 1')
    expect(log.action).toBe('judge.create')
    expect(log.target_type).toBe('judge')
  })

  test('a created judge does not collide with an existing slug', async () => {
    const res = await invoke(saveAction, { name: 'Brian Curtis Wimes', court_house_id: 1 })
    // Two rows already carry this name; the new one must not take a slug in use.
    expect(res.body?.slug).toBe('brian-curtis-wimes-3')
  })

  test('editing without renaming keeps the existing slug', async () => {
    const res = await invoke(saveAction, { name: 'Brian Curtis Wimes', bio: 'Appointed 2014.', court_house_id: 1 }, { id: '1' }, 'PATCH')
    expect(res.status).toBe(200)
    const [row] = query('SELECT slug, bio FROM judges WHERE id = 1')
    // A bio edit must not move the judge's public URL.
    expect(row.slug).toBe('brian-curtis-wimes')
    expect(row.bio).toBe('Appointed 2014.')
  })

  test('a bad courthouse is a sentence, not a constraint error', async () => {
    const res = await invoke(saveAction, { name: 'Someone New', court_house_id: 999999 })
    expect(res.status).toBe(422)
    expect(String(res.body?.error)).toContain('courthouse')
  })

  test('status is held to the documented set', async () => {
    expect((await invoke(saveAction, { name: 'Someone New', status: 'semi-retired' })).status).toBe(422)
  })

  test('merge moves reviews, opinions and follows, then deletes the source', async () => {
    const keep = addReview(1, USER_A)
    const move = addReview(2, USER_B)
    addFollow(1, USER_A)
    addFollow(2, USER_B)
    const raw = openTestDatabase()
    raw.run('INSERT INTO judge_opinions (judge_id, case_name, uuid, created_at) VALUES (2, \'Doe v Roe\', \'op-1\', datetime(\'now\'))')
    raw.run('UPDATE users SET claimed_judge_id = 2, credential_type = \'judge\', credential_verified_at = datetime(\'now\') WHERE id = ?', [USER_B])
    raw.close()

    const res = await invoke(mergeAction, { sourceId: 2 }, { id: '1' })

    expect(res.status).toBe(200)
    expect(query('SELECT id FROM judges WHERE id = 2').length).toBe(0)
    expect(query('SELECT judge_id FROM judge_reviews WHERE id = ?', move)[0].judge_id).toBe(1)
    expect(query('SELECT judge_id FROM judge_reviews WHERE id = ?', keep)[0].judge_id).toBe(1)
    expect(query('SELECT judge_id FROM judge_opinions')[0].judge_id).toBe(1)
    expect(query('SELECT claimed_judge_id FROM users WHERE id = ?', USER_B)[0].claimed_judge_id).toBe(1)
    expect(query('SELECT judge_id FROM judge_follows').every((f: any) => f.judge_id === 1)).toBe(true)
  })

  test('a follower of both profiles ends up with one follow, not a constraint error', async () => {
    addFollow(1, USER_A)
    addFollow(2, USER_A)

    const res = await invoke(mergeAction, { sourceId: 2 }, { id: '1' })

    expect(res.status).toBe(200)
    expect(res.body?.dropped_duplicate_follows).toBe(1)
    // The unique index on (user_id, judge_id) would have thrown mid-merge,
    // leaving the source judge deleted and its reviews orphaned.
    expect(query('SELECT id FROM judge_follows WHERE user_id = ?', USER_A).length).toBe(1)
  })

  test('a reviewer with a live review of both profiles blocks the merge', async () => {
    const a = addReview(1, USER_A)
    const b = addReview(2, USER_A)

    const res = await invoke(mergeAction, { sourceId: 2 }, { id: '1' })

    expect(res.status).toBe(409)
    expect(res.body?.conflicts?.[0]).toMatchObject({ user_id: USER_A, source_review_id: b, target_review_id: a })
    // Refused BEFORE anything moved: which of two pieces of writing about a
    // real judge survives is an editorial decision, not a side effect.
    expect(query('SELECT id FROM judges WHERE id = 2').length).toBe(1)
    expect(query('SELECT judge_id FROM judge_reviews WHERE id = ?', b)[0].judge_id).toBe(2)
  })

  test('a rejected review on one side is not a conflict', async () => {
    addReview(1, USER_A)
    addReview(2, USER_A, 'rejected')
    // The partial unique index excludes rejected rows, so this merge is safe.
    expect((await invoke(mergeAction, { sourceId: 2 }, { id: '1' })).status).toBe(200)
  })

  test('two verified claimants block the merge', async () => {
    const raw = openTestDatabase()
    raw.run('UPDATE users SET claimed_judge_id = 1, credential_type = \'judge\', credential_verified_at = datetime(\'now\') WHERE id = ?', [USER_A])
    raw.run('UPDATE users SET claimed_judge_id = 2, credential_type = \'judge\', credential_verified_at = datetime(\'now\') WHERE id = ?', [USER_B])
    raw.close()

    const res = await invoke(mergeAction, { sourceId: 2 }, { id: '1' })

    expect(res.status).toBe(409)
    // Otherwise two people are verified as the same judge, which is exactly
    // what the claim flow exists to prevent.
    expect(query('SELECT id FROM judges WHERE id = 2').length).toBe(1)
  })

  test('a judge cannot be merged into itself', async () => {
    expect((await invoke(mergeAction, { sourceId: 1 }, { id: '1' })).status).toBe(422)
  })

  test('the index lists courthouse and review counts', async () => {
    addReview(1, USER_A)
    addReview(1, USER_B)

    const res = await invoke(indexAction, { q: 'Wimes' }, {}, 'GET')

    expect(res.body?.total).toBe(2)
    const first = res.body.judges.find((j: any) => j.id === 1)
    expect(first.court_house.name).toBe('E.D. Missouri')
    // The two things a moderator needs before merging or retiring a profile.
    expect(first.review_count).toBe(2)
  })
})
