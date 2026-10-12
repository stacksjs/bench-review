import { Auth } from '@stacksjs/auth'
import * as email from '@stacksjs/email'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import bulkAction from '../../app/Actions/Admin/Reviews/BulkUpdateReviewStatusAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Bulk review moderation — bench-review#51.
 *
 * Reviews are pending by default, so the moderator was the publication
 * bottleneck: one request and one click per row. Batching them is only
 * worth having if a batch is genuinely the same decision repeated — not a
 * quiet fast path that skips the audit row or the author's email.
 *
 * So what these tests hold down is that every row in a batch goes through
 * the same consequences as a single-id call (one audit row each, flags
 * closed on reject), that a bad id in the batch costs only that row, and
 * that the batch cannot be used to write an unbounded number of rows.
 */

const ADMIN_ID = 8401
const AUTHOR_ID = 8402

/**
 * Seed `count` reviews at `status`; returns their ids in insert order.
 *
 * One review per JUDGE rather than per author: `judge_reviews` carries a
 * UNIQUE index on (user_id, judge_id) — one person may review a given judge
 * once — so a batch of same-author rows has to spread across judges.
 */
function seed(count: number, status: string): number[] {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_flags')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [ADMIN_ID, AUTHOR_ID])
  // Emails namespaced per test FILE — `users.email` is globally unique and
  // the suite shares one database.
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [ADMIN_ID, 'Mod', 'bulk-mod@example.test', AUTHOR_ID, 'Author', 'bulk-author@example.test'],
  )
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    raw.run(
      'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (?, ?, ?, ?, 3, ?, ?, datetime(\'now\'))',
      [i + 1, AUTHOR_ID, `Queued review ${i}`, 'body', status, `bulk-test-${Date.now()}-${i}`],
    )
    const row = raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as { id: number }
    ids.push(Number(row.id))
  }
  raw.close()
  return ids
}

function statusesOf(ids: number[]): string[] {
  const raw = openTestDatabase()
  const out = ids.map((id) => {
    const row = raw.query('SELECT status FROM judge_reviews WHERE id = ?').get(id) as { status: string } | null
    return row?.status ?? 'missing'
  })
  raw.close()
  return out
}

function auditActions(): string[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT action, target_id FROM moderation_logs ORDER BY id').all() as Array<{ action: string, target_id: number }>
  raw.close()
  return rows.map(r => `${r.action}:${r.target_id}`)
}

function addFlag(reviewId: number): void {
  const raw = openTestDatabase()
  raw.run(
    'INSERT INTO review_flags (judge_review_id, user_id, reason, status, created_at) VALUES (?, NULL, ?, \'open\', datetime(\'now\'))',
    [reviewId, 'harassment'],
  )
  raw.close()
}

function openFlagCount(): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT COUNT(*) AS c FROM review_flags WHERE status = \'open\'').get() as { c: number }
  raw.close()
  return Number(row.c)
}

async function bulk(payload: Record<string, unknown>): Promise<{ status: number, body: any }> {
  const req = {
    url: 'http://localhost:4008/api/admin/reviews/bulk-status',
    method: 'POST',
    params: {},
    query: payload,
    get: (k: string) => (payload as any)[k],
    all: () => payload,
  }
  const res: any = await runWithRequest(req as any, () => (bulkAction as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

// Author mail is best-effort in the action; left real it reaches for SMTP
// on 127.0.0.1:2525 and logs a stack per row. Not what these tests measure.
;(email as any).mail.send = async () => ({ message: 'stubbed' })

describe('bulk review status', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: ADMIN_ID }) })

  test('publishes every selected review and logs each one', async () => {
    const ids = seed(3, 'pending')
    const res = await bulk({ ids, status: 'published' })

    expect(res.status).toBe(200)
    expect(res.body?.updated).toEqual(ids)
    expect(res.body?.failed).toEqual([])
    expect(statusesOf(ids)).toEqual(['published', 'published', 'published'])
    // Per-row logging is the criterion: three decisions, three audit rows,
    // each naming its own review. A single "bulk" row would lose which
    // reviews an admin actually published.
    expect(auditActions()).toEqual(ids.map(id => `review.publish:${id}`))
  })

  test('a bad id costs only its own row', async () => {
    const ids = seed(2, 'pending')
    const res = await bulk({ ids: [ids[0], 999999, ids[1]], status: 'published' })

    expect(res.status).toBe(200)
    expect(res.body?.updated).toEqual(ids)
    expect(res.body?.failed).toEqual([{ id: 999999, error: 'Review not found.' }])
    expect(statusesOf(ids)).toEqual(['published', 'published'])
  })

  test('rows already at the target status are unchanged, not re-logged', async () => {
    const ids = seed(2, 'published')
    const res = await bulk({ ids, status: 'published' })

    expect(res.body?.updated).toEqual([])
    expect(res.body?.unchanged).toEqual(ids)
    // No transition, so no audit row, no notification, no email — the same
    // rule the single-id endpoint applies.
    expect(auditActions()).toEqual([])
  })

  test('rejecting a batch closes the flags on every row', async () => {
    const ids = seed(2, 'published')
    addFlag(ids[0])
    addFlag(ids[1])
    expect(openFlagCount()).toBe(2)

    await bulk({ ids, status: 'rejected' })

    expect(statusesOf(ids)).toEqual(['rejected', 'rejected'])
    // The flag alert is re-armed per review, not just for the first row of
    // the batch: moderators are emailed only on a review's FIRST open flag.
    expect(openFlagCount()).toBe(0)
  })

  test('a repeated id is applied once', async () => {
    const ids = seed(1, 'pending')
    const res = await bulk({ ids: [ids[0], ids[0], ids[0]], status: 'published' })

    expect(res.body?.updated).toEqual(ids)
    // Deduped before the loop — otherwise the second pass sees the row
    // already published and reports it as 'unchanged', which reads as a
    // failure the moderator has to go and check.
    expect(res.body?.unchanged).toEqual([])
    expect(auditActions()).toEqual([`review.publish:${ids[0]}`])
  })

  test('rejects input it cannot act on safely', async () => {
    const ids = seed(1, 'pending')

    expect((await bulk({ ids, status: 'deleted' })).status).toBe(422)
    expect((await bulk({ ids: String(ids[0]), status: 'published' })).status).toBe(422)
    expect((await bulk({ ids: [], status: 'published' })).status).toBe(422)
    expect((await bulk({ ids: ['x', 0, -4], status: 'published' })).status).toBe(422)
    // Capped: one request must not be able to write 500 audit rows or fire
    // 500 emails.
    expect((await bulk({ ids: Array.from({ length: 51 }, (_, i) => i + 1), status: 'published' })).status).toBe(422)

    // Nothing was touched by any of them.
    expect(statusesOf(ids)).toEqual(['pending'])
    expect(auditActions()).toEqual([])
  })
})
