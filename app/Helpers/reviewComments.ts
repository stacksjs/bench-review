import { db } from '@stacksjs/database'

/**
 * Hydrates `comments` (count) on a page of review rows.
 *
 * The feed's rows carry a comment affordance, and an affordance with no
 * number beside it is worse than no affordance: it makes every review look
 * equally discussed, so nobody taps any of them. The count is what tells a
 * thread worth opening from one that is empty.
 *
 * Shaped after `reviewLikes.ts`, deliberately — same page, same problem, and
 * a second helper that solved it a different way would be two things to keep
 * in step. One grouped lookup collapses what would otherwise be one COUNT per
 * visible row, and an empty page short-circuits it.
 *
 * Only **published** comments are counted. The thread endpoint filters the
 * same way, so a count that included moderated-away rows would promise a
 * number the screen then could not show.
 */
export async function hydrateCommentCounts<T extends Record<string, any>>(
  rows: T[],
): Promise<Array<T & { comments: number }>> {
  if (rows.length === 0)
    return []

  const plain = rows.map(r => ((r as any).toJSON ? (r as any).toJSON() : r) as T)
  const ids = plain.map(r => r.id).filter(n => Number.isFinite(n)) as number[]
  if (ids.length === 0)
    return plain.map(r => ({ ...r, comments: 0 }))

  // COUNT(*) goes in as a plain string, not a `sql` template tag:
  // bun-query-builder's `.select(cols)` joins its argument with `.join(', ')`,
  // so a fragment object stringifies to "[object Object]" and SQLite answers
  // `no such column: object Object`. The literal carries no user input.
  const countRows = await (db.selectFrom('review_comments') as any)
    .select(['judge_review_id', 'COUNT(*) as c'])
    .where('judge_review_id', 'in', ids as any)
    .where('status', '=', 'published')
    .groupBy('judge_review_id')
    .execute() as Array<{ judge_review_id: number, c: number | string }>

  // Reviews with no comments are absent from the grouped result, not zero in
  // it, so the merge defaults them rather than trusting the lookup.
  const countByReview = new Map<number, number>()
  for (const r of countRows)
    countByReview.set(Number(r.judge_review_id), Number(r.c))

  return plain.map(r => ({ ...r, comments: countByReview.get(r.id) ?? 0 }))
}
