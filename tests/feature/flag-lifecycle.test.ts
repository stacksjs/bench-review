import { Auth } from '@stacksjs/auth'
import * as email from '@stacksjs/email'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import statusAction from '../../app/Actions/Admin/Reviews/UpdateReviewStatusAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Flag lifecycle — bench-review#51.
 *
 * The property worth protecting is not tidiness, it is the ALERT.
 *
 * Moderators are emailed only on the first open flag against a review:
 * FlagReviewAction counts open rows before inserting, so that anonymous
 * flagging cannot spam them. The corollary is that a flag left open after
 * the review was dealt with means the count is never zero again — and a
 * review that is rejected, edited by its author and re-published can then be
 * reported a hundred more times in complete silence.
 *
 * Deleting a review already clears its flags. Rejecting one did not.
 */

const ADMIN_ID = 8201
const AUTHOR_ID = 8202

function seed(reviewStatus: string, flagStatuses: string[]): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_flags')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [ADMIN_ID, AUTHOR_ID])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    // Emails are namespaced per test FILE. `users.email` is globally unique
    // and the suite shares one database, so a fixture address reused across
    // files collides on whichever file runs second — which passes in
    // isolation and fails in a full run, the most annoying shape of flake.
    [ADMIN_ID, 'Mod', 'flag-mod@example.test', AUTHOR_ID, 'Author', 'flag-author@example.test'],
  )
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (1, ?, ?, ?, 2, ?, ?, datetime(\'now\'))',
    [AUTHOR_ID, 'Reported review', 'body', reviewStatus, `flag-test-${Date.now()}`],
  )
  const review = raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as { id: number }
  for (const s of flagStatuses) {
    raw.run(
      'INSERT INTO review_flags (judge_review_id, user_id, reason, status, created_at) VALUES (?, NULL, ?, ?, datetime(\'now\'))',
      [review.id, 'harassment', s],
    )
  }
  raw.close()
  return Number(review.id)
}

function flagStatuses(reviewId: number): string[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT status FROM review_flags WHERE judge_review_id = ? ORDER BY id').all(reviewId) as Array<{ status: string }>
  raw.close()
  return rows.map(r => r.status)
}

/** What FlagReviewAction asks before deciding whether to email moderators. */
function openFlagCount(reviewId: number): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT COUNT(*) AS c FROM review_flags WHERE judge_review_id = ? AND status = \'open\'').get(reviewId) as { c: number }
  raw.close()
  return Number(row.c)
}

async function setStatus(reviewId: number, status: string): Promise<number> {
  const fields: Record<string, any> = { status }
  const req = {
    url: `http://localhost:4008/api/admin/reviews/${reviewId}/status`,
    method: 'PATCH',
    params: { id: String(reviewId) },
    query: fields,
    get: (k: string) => fields[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (statusAction as any).handle())
  return typeof res?.status === 'number' ? res.status : 200
}

// The action emails the author on reject, best-effort. Left real, it tries
// SMTP on 127.0.0.1:2525 and logs two stack traces per test — the failure
// handling working correctly, but loud enough to bury a genuine one. The
// mail is not what these tests are about.
;(email as any).mail.send = async () => ({ message: 'stubbed' })

describe('flag lifecycle', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: ADMIN_ID }) })

  test('rejecting a review closes the flags that asked for it', async () => {
    const id = seed('published', ['open', 'open'])
    expect(openFlagCount(id)).toBe(2)

    expect(await setStatus(id, 'rejected')).toBe(200)

    expect(flagStatuses(id)).toEqual(['resolved', 'resolved'])
    // The alert is armed again: the next report on this review will be the
    // first open one, so moderators get an email.
    expect(openFlagCount(id)).toBe(0)
  })

  test('already-closed flags are left as they were', async () => {
    const id = seed('published', ['dismissed', 'open'])
    await setStatus(id, 'rejected')
    // A dismissed flag was a judgement call; rejecting the review later does
    // not rewrite it as "acted on".
    expect(flagStatuses(id)).toEqual(['dismissed', 'resolved'])
  })

  test('publishing a review does NOT close its flags', async () => {
    const id = seed('pending', ['open'])
    await setStatus(id, 'published')
    // Approving something that was reported does not answer the report —
    // the flag stays open for a moderator to deal with on its own terms.
    expect(flagStatuses(id)).toEqual(['open'])
    expect(openFlagCount(id)).toBe(1)
  })

  test('re-rejecting an already-rejected review changes nothing', async () => {
    const id = seed('rejected', ['open'])
    await setStatus(id, 'rejected')
    // No transition, so no side effects — the same rule the audit log uses.
    expect(flagStatuses(id)).toEqual(['open'])
  })

  test('a review with no flags rejects cleanly', async () => {
    const id = seed('published', [])
    expect(await setStatus(id, 'rejected')).toBe(200)
    expect(flagStatuses(id)).toEqual([])
  })
})
