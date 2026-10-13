import { beforeEach, describe, expect, test } from 'bun:test'
import { recountReviewComments } from '../../app/Helpers/commentCount'
import { openTestDatabase } from '../helpers/database'

/**
 * Comment counter — bench-review#52.
 *
 * `judge_reviews.comments` is denormalised, and two of the three places that
 * maintained it did read-modify-write: read N, write N±1. That loses an
 * update when two comments land together, and the loss is permanent — every
 * later nudge builds on a number nobody rechecks. The clamp in the delete
 * path (`Math.max(0, n - 1)`) was the tell: it only exists if the value is
 * already expected to be wrong.
 */

const REVIEW = 9201
const USER = 9202

function seed(startingCount: number): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_comments')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id = ?', [USER])
  raw.run('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\'))', [USER, 'U', 'count-user@example.test'])
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\'))')
  raw.run(
    'INSERT INTO judge_reviews (id, judge_id, user_id, title, content, rating, status, comments, uuid, created_at) VALUES (?, 1, ?, \'t\', \'c\', 4, \'published\', ?, ?, datetime(\'now\'))',
    [REVIEW, USER, startingCount, `cnt-${Date.now()}`],
  )
  raw.close()
}

function addComment(status = 'published'): void {
  const raw = openTestDatabase()
  raw.run(
    'INSERT INTO review_comments (judge_review_id, user_id, body, status, uuid, created_at) VALUES (?, ?, \'hi\', ?, ?, datetime(\'now\'))',
    [REVIEW, USER, status, `c-${Date.now()}-${Math.random()}`],
  )
  raw.close()
}

function counter(): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT comments FROM judge_reviews WHERE id = ?').get(REVIEW) as { comments: number }
  raw.close()
  return Number(row.comments)
}

describe('comment counter', () => {
  beforeEach(() => { seed(0) })

  test('counts the published comments that exist', async () => {
    addComment()
    addComment()
    expect(await recountReviewComments(REVIEW)).toBe(2)
    expect(counter()).toBe(2)
  })

  test('pending and rejected comments are not counted', async () => {
    addComment('published')
    addComment('pending')
    addComment('rejected')
    // The counter is what readers see under a review, and they see neither.
    expect(await recountReviewComments(REVIEW)).toBe(1)
  })

  test('an already-drifted counter is corrected rather than nudged', async () => {
    seed(17)
    addComment()
    // This is what a nudge cannot do. Under +1 the number would become 18 and
    // stay wrong forever; recounting heals it on the next mutation.
    await recountReviewComments(REVIEW)
    expect(counter()).toBe(1)
  })

  test('a review with no comments lands on zero, not a negative', async () => {
    seed(3)
    await recountReviewComments(REVIEW)
    expect(counter()).toBe(0)
  })

  test('the seeder no longer writes phantom counts', async () => {
    const source = await Bun.file('database/seeders/ReviewSeeder.ts').text()
    // The fixtures claimed 18, 12, 9 … comments while creating no
    // review_comments rows at all, so the first real comment on a seeded
    // review appeared to delete seventeen of them.
    expect(source).not.toMatch(/comments: [1-9]\d*/)
    expect(source).not.toContain('r.comments')
  })
})
