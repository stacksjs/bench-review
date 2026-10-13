import { beforeEach, describe, expect, test } from 'bun:test'
import { deleteReviewCascade, deleteReviewsByUser } from '../../app/Helpers/reviewCascade'
import { deleteUserOwnedRows } from '../../app/Helpers/userCascade'
import { openTestDatabase } from '../helpers/database'

/**
 * Review delete cascade — bench-review#52.
 *
 * Every child of `judge_reviews` holds a foreign key with ON DELETE NO
 * ACTION, and foreign keys are enforced on the app's connection. That turns a
 * missing table in a cascade list from an orphaned-row problem into a hard
 * block, and both delete paths were missing the same one: `judge_responses`.
 *
 * The account-deletion path was worse. It deleted `judge_reviews` by user_id
 * as the FIRST entry of a best-effort list, so any review with a comment,
 * photo, flag or judge response failed its constraint, the error went into a
 * `.catch(() => {})`, and the review SURVIVED an erasure request while the
 * rows around it were removed.
 */

const AUTHOR = 9101
const OTHER = 9102

function seedReview(opts: { response?: boolean, comment?: boolean, photo?: boolean } = {}): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_responses')
  raw.run('DELETE FROM review_comments')
  raw.run('DELETE FROM review_photos')
  raw.run('DELETE FROM review_flags')
  raw.run('DELETE FROM judge_reviews_likes')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [AUTHOR, OTHER])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [AUTHOR, 'Author', 'cascade-author@example.test', OTHER, 'Other', 'cascade-other@example.test'],
  )
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\'))')
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (1, ?, \'t\', \'c\', 4, \'published\', ?, datetime(\'now\'))',
    [AUTHOR, `casc-${Date.now()}-${Math.random()}`],
  )
  const id = Number((raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as any).id)
  if (opts.response !== false) {
    raw.run(
      'INSERT INTO judge_responses (judge_review_id, judge_id, body, uuid, created_at) VALUES (?, 1, \'Official reply\', ?, datetime(\'now\'))',
      [id, `resp-${Date.now()}-${Math.random()}`],
    )
  }
  if (opts.comment !== false) {
    raw.run(
      'INSERT INTO review_comments (judge_review_id, user_id, body, status, uuid, created_at) VALUES (?, ?, \'nice\', \'published\', ?, datetime(\'now\'))',
      [id, OTHER, `cmt-${Date.now()}-${Math.random()}`],
    )
  }
  raw.close()
  return id
}

function counts(reviewId: number): Record<string, number> {
  const raw = openTestDatabase()
  const out: Record<string, number> = {}
  for (const t of ['judge_responses', 'review_comments', 'review_photos', 'review_flags', 'judge_reviews_likes']) {
    const row = raw.query(`SELECT COUNT(*) AS c FROM ${t} WHERE judge_review_id = ?`).get(reviewId) as { c: number }
    out[t] = Number(row.c)
  }
  const r = raw.query('SELECT COUNT(*) AS c FROM judge_reviews WHERE id = ?').get(reviewId) as { c: number }
  out.judge_reviews = Number(r.c)
  raw.close()
  return out
}

describe('review delete cascade', () => {
  beforeEach(() => { seedReview() })

  test('a review with a judge response can actually be deleted', async () => {
    const id = seedReview()
    expect(counts(id).judge_responses).toBe(1)

    await deleteReviewCascade(id)

    // Before the shared helper this threw: judge_responses was in neither
    // path's list, and its FK refused the parent delete.
    expect(counts(id)).toEqual({
      judge_responses: 0,
      review_comments: 0,
      review_photos: 0,
      review_flags: 0,
      judge_reviews_likes: 0,
      judge_reviews: 0,
    })
  })

  test('cascading a review that is already gone is a no-op', async () => {
    const id = seedReview()
    await deleteReviewCascade(id)
    // Account deletion cascades every review a user wrote and may be retried
    // after a partial failure, so a second pass must not throw.
    await deleteReviewCascade(id)
    expect(counts(id).judge_reviews).toBe(0)
  })

  test('deleting an account removes the reviews that account wrote', async () => {
    const id = seedReview()

    await deleteUserOwnedRows(AUTHOR)

    // The bug: judge_reviews was the first entry of a best-effort list keyed
    // on user_id, so the FK from this review's comment and response refused
    // it, the throw was caught, and the review stayed published after an
    // erasure request.
    expect(counts(id).judge_reviews).toBe(0)
    expect(counts(id).judge_responses).toBe(0)
    expect(counts(id).review_comments).toBe(0)
  })

  test('another user\'s comment on the deleted review goes too', async () => {
    const id = seedReview()
    // The comment belongs to OTHER, not the author being erased — it is not
    // "their" row, but it cannot outlive the review it hangs off.
    await deleteReviewsByUser(AUTHOR)
    expect(counts(id).review_comments).toBe(0)
  })

  test('a review with no children deletes cleanly', async () => {
    const id = seedReview({ response: false, comment: false })
    await deleteReviewCascade(id)
    expect(counts(id).judge_reviews).toBe(0)
  })
})
