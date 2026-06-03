import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'

/**
 * Hydrates `likes` (count) and `liked_by_me` on a page of review rows.
 *
 * The `judge_reviews_likes` pivot is the single source of truth for
 * reactions — there is no denormalised counter on `judge_reviews`
 * anymore. Two N+1-collapse queries per page replace what would
 * otherwise be:
 *
 *   - N × `_likeable.likeCount(reviewId)` (one per row)
 *   - N × `_likeable.isLiked(reviewId, userId)` (one per row, only
 *     when the caller is authed)
 *
 * Both are folded into single grouped lookups against the pivot. An
 * empty page short-circuits both queries; an anonymous request skips
 * the liked-by-me query entirely (count-only).
 *
 * Each row is normalised to a plain object first so the returned
 * shape carries the extra fields even if the ORM gave us model
 * instances. `Response.json()` would otherwise serialise the model
 * via its `toJSON` and drop properties added after the spread.
 */
export async function hydrateLikeData<T extends { id: number }>(
  rows: T[],
): Promise<Array<T & { likes: number, liked_by_me: boolean }>> {
  if (rows.length === 0)
    return []

  const plain = rows.map(r => ((r as any).toJSON ? (r as any).toJSON() : r) as T)
  const ids = plain.map(r => r.id).filter(n => Number.isFinite(n)) as number[]
  if (ids.length === 0) {
    return plain.map(r => ({ ...r, likes: 0, liked_by_me: false }))
  }

  let userId: number | undefined
  try {
    const authUser = await Auth.user()
    userId = (authUser as any)?.id
  }
  catch {
    // Token missing/invalid — fall through anonymous (likes only).
  }

  // ─── Count fan-out ────────────────────────────────────────────────
  // Single grouped SELECT over the visible page. Result shape:
  //   [{ judge_review_id: 12, c: 4 }, { judge_review_id: 14, c: 1 }, …]
  // Rows with zero likes don't appear (left out by the inner JOIN) —
  // the merge step below defaults them to 0.
  //
  // Note: COUNT(*) is passed as a plain string in the select array,
  // not as a `sql\`COUNT(*)\`` template tag. bun-query-builder's
  // `.select(cols)` joins its argument via `.join(', ')` — a tagged
  // SQL fragment object would stringify to "[object Object]" and
  // SQLite would 500 with `no such column: object Object`. The
  // literal carries no user input so this is safe.
  const countRows = await (db.selectFrom('judge_reviews_likes') as any)
    .select(['judge_review_id', 'COUNT(*) as c'])
    .where('judge_review_id', 'in', ids as any)
    .groupBy('judge_review_id')
    .execute() as Array<{ judge_review_id: number, c: number | string }>

  const countByReview = new Map<number, number>()
  for (const r of countRows)
    countByReview.set(Number(r.judge_review_id), Number(r.c))

  // ─── Liked-by-me fan-out ──────────────────────────────────────────
  // Anonymous: skip the query entirely; everyone gets false.
  const likedByMe = new Set<number>()
  if (userId) {
    const likedRows = await (db.selectFrom('judge_reviews_likes') as any)
      .select('judge_review_id')
      .where('user_id', '=', userId)
      .where('judge_review_id', 'in', ids as any)
      .execute() as Array<{ judge_review_id: number }>
    for (const r of likedRows)
      likedByMe.add(Number(r.judge_review_id))
  }

  return plain.map(r => ({
    ...r,
    likes: countByReview.get(r.id) ?? 0,
    liked_by_me: likedByMe.has(r.id),
  }))
}

/**
 * Backwards-compatible alias for the old name. New code should use
 * `hydrateLikeData` since the helper now hydrates both fields, not
 * just `liked_by_me`. Keep this until callers migrate (just three
 * actions today — see `app/Actions/Reviews/{Latest,Show,...}`).
 */
export const hydrateLikedByMe = hydrateLikeData
