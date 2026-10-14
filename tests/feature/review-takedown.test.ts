import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import deleteAction from '../../app/Actions/Admin/Reviews/DeleteReviewAction'
import updateMine from '../../app/Actions/Me/UpdateMyReviewAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Admin takedown is a soft delete — bench-review#53.
 *
 * The two situations most likely to require one are a threat and a
 * judicial-privacy removal request, and both are ones where the question
 * afterwards is "what exactly was published, and when did you remove it". A
 * hard DELETE answers neither, and the moderation log's snapshot was the only
 * trace left.
 *
 * `status = 'removed'` is what hides it, because every public query already
 * filters `status = 'published'`. The thing worth testing is the line between
 * 'rejected' and 'removed': rejected is a moderation decision the author can
 * see and edit against, removed is a takedown they must not be able to read or
 * edit their way out of.
 */

const ADMIN = 9301
const AUTHOR = 9302

function seed(): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_comments')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [ADMIN, AUTHOR])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [ADMIN, 'Mod', 'takedown-mod@example.test', AUTHOR, 'Author', 'takedown-author@example.test'],
  )
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\'))')
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (1, ?, ?, ?, 2, \'published\', ?, datetime(\'now\'))',
    [AUTHOR, 'Threatening review', '<p>the original text</p>', `td-${Date.now()}`],
  )
  const id = Number((raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as any).id)
  raw.run(
    'INSERT INTO review_comments (judge_review_id, user_id, body, status, uuid, created_at) VALUES (?, ?, \'agreed\', \'published\', ?, datetime(\'now\'))',
    [id, ADMIN, `c-${Date.now()}`],
  )
  raw.close()
  return id
}

function row(id: number): any {
  const raw = openTestDatabase()
  const r = raw.query('SELECT id, status, deleted_at, content FROM judge_reviews WHERE id = ?').get(id)
  raw.close()
  return r
}

function commentCount(id: number): number {
  const raw = openTestDatabase()
  const r = raw.query('SELECT COUNT(*) AS c FROM review_comments WHERE judge_review_id = ?').get(id) as { c: number }
  raw.close()
  return Number(r.c)
}

function logs(): any[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT action, metadata FROM moderation_logs ORDER BY id').all() as any[]
  raw.close()
  return rows
}

async function invoke(action: any, params: Record<string, string>, fields: Record<string, unknown> = {}): Promise<number> {
  const req = {
    url: 'http://localhost:4008/api/admin/reviews',
    method: 'POST',
    params,
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (action as any).handle())
  return typeof res?.status === 'number' ? res.status : 200
}

describe('admin takedown', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: ADMIN }) })

  test('the review survives as removed, with the time recorded', async () => {
    const id = seed()
    expect(await invoke(deleteAction, { id: String(id) })).toBe(200)

    const r = row(id)
    // The row is still there — this is the evidence trail a hard DELETE
    // destroyed.
    expect(r).toBeTruthy()
    expect(r.status).toBe('removed')
    expect(r.deleted_at).not.toBeNull()
    expect(r.content).toBe('<p>the original text</p>')
  })

  test('the children go, because they are not the evidence', async () => {
    const id = seed()
    expect(commentCount(id)).toBe(1)
    await invoke(deleteAction, { id: String(id) })
    expect(commentCount(id)).toBe(0)
  })

  test('the moderation log keeps a snapshot of what was published', async () => {
    const id = seed()
    await invoke(deleteAction, { id: String(id) })

    const [entry] = logs()
    expect(entry.action).toBe('review.delete')
    const meta = JSON.parse(entry.metadata)
    // The row can still be redacted later, so the snapshot is what the
    // original actually said.
    expect(meta.snapshot.content).toBe('<p>the original text</p>')
    expect(meta.snapshot.title).toBe('Threatening review')
  })

  test('the author cannot edit their way out of a takedown', async () => {
    const id = seed()
    await invoke(deleteAction, { id: String(id) })
    ;(Auth as any).user = async () => ({ id: AUTHOR })

    const status = await invoke(updateMine, { id: String(id) }, { title: 'Softened title' })

    // 404, not 403: the review is gone for them, and an explicit refusal
    // would confirm it still exists. An edit would also reset status to
    // 'pending' and walk the review back out of a removal.
    expect(status).toBe(404)
    expect(row(id).status).toBe('removed')
  })

  test('a review that is already gone is a 404', async () => {
    expect(await invoke(deleteAction, { id: '999999' })).toBe(404)
  })
})
