import { beforeEach, describe, expect, test } from 'bun:test'
import { hydrateCommentCounts } from '../../app/Helpers/reviewComments'
import { openTestDatabase } from '../helpers/database'

/**
 * `comments` on a page of review rows — bench-review#44, bench-review#79.
 *
 * The native feed's comment button needs a number beside it: an affordance
 * with no count makes every review look equally discussed, so nobody opens
 * any of them. This is the lookup behind that number.
 */

const JUDGE = 9901
const WITH_TWO = 99011
const WITH_NONE = 99012
const WITH_MODERATED = 99013

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_comments WHERE judge_review_id IN (?, ?, ?)', [WITH_TWO, WITH_NONE, WITH_MODERATED])
  raw.run('DELETE FROM judge_reviews WHERE id IN (?, ?, ?)', [WITH_TWO, WITH_NONE, WITH_MODERATED])
  raw.run('DELETE FROM judges WHERE id = ?', [JUDGE])
  raw.run(
    'INSERT INTO judges (id, uuid, name, practice_area, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [JUDGE, 'j-comment-counts', 'Comment Count Test', 'other'],
  )
  for (const id of [WITH_TWO, WITH_NONE, WITH_MODERATED]) {
    raw.run(
      'INSERT INTO judge_reviews (id, uuid, judge_id, title, content, rating, status, created_at) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      [id, `r-comment-${id}`, JUDGE, 'A review', '<p>Body</p>', 4, 'published'],
    )
  }

  const comment = (id: number, reviewId: number, status: string): void => {
    raw.run(
      'INSERT INTO review_comments (id, uuid, judge_review_id, body, status, created_at) '
      + 'VALUES (?, ?, ?, ?, ?, datetime(\'now\'))',
      [id, `c-${id}`, reviewId, 'A comment', status],
    )
  }
  comment(990101, WITH_TWO, 'published')
  comment(990102, WITH_TWO, 'published')
  // Taken down by a moderator. The thread endpoint will not serve it, so the
  // count must not promise it either.
  comment(990103, WITH_MODERATED, 'rejected')
  raw.close()
}

describe('hydrateCommentCounts', () => {
  beforeEach(seed)

  test('counts published comments per review', async () => {
    const rows = await hydrateCommentCounts([{ id: WITH_TWO }, { id: WITH_NONE }])
    expect(rows.find(r => r.id === WITH_TWO)?.comments).toBe(2)
  })

  test('a review with no comments is zero, not missing', async () => {
    // Rows with no comments are absent from the grouped result rather than
    // present with a zero, so the merge has to default them. Without that the
    // field is undefined and the button renders "undefined".
    const rows = await hydrateCommentCounts([{ id: WITH_NONE }])
    expect(rows[0].comments).toBe(0)
  })

  test('a moderated comment is not counted', async () => {
    // The count has to agree with what the thread will actually show, or the
    // button promises a conversation that is not there.
    const rows = await hydrateCommentCounts([{ id: WITH_MODERATED }])
    expect(rows[0].comments).toBe(0)
  })

  test('an empty page does no work and returns nothing', async () => {
    expect(await hydrateCommentCounts([])).toEqual([])
  })

  test('the rest of the row survives', async () => {
    // The helper spreads each row; a model instance would otherwise be
    // serialised by its own toJSON and drop fields added after the spread.
    const rows = await hydrateCommentCounts([{ id: WITH_TWO, title: 'A review', likes: 3 }])
    expect(rows[0]).toMatchObject({ id: WITH_TWO, title: 'A review', likes: 3, comments: 2 })
  })
})
