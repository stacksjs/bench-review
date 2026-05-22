import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'

/**
 * Hydrates `liked_by_me` on a page of review rows.
 *
 * Reads the current bearer-token user (best effort — anonymous reads
 * are fine, they just get `liked_by_me=false` everywhere). When a
 * user is present, fans the per-page liked-status lookup into a
 * single SELECT against `judge_reviews_likes` rather than N
 * `_likeable.isLiked(id, userId)` calls. Same N+1-collapse pattern
 * used by `UserIndexAction` for role hydration.
 *
 * Each row is normalised to a plain object first so the returned
 * shape carries the extra field even if the ORM gave us model
 * instances. `Response.json()` would otherwise serialise the model
 * via its `toJSON` and drop the added property.
 */
export async function hydrateLikedByMe<T extends { id: number }>(
  rows: T[],
): Promise<Array<T & { liked_by_me: boolean }>> {
  if (rows.length === 0)
    return []

  const plain = rows.map(r => ((r as any).toJSON ? (r as any).toJSON() : r) as T)

  let userId: number | undefined
  try {
    const authUser = await Auth.user()
    userId = (authUser as any)?.id
  }
  catch {
    // Token missing/invalid — fall through anonymous.
  }

  if (!userId)
    return plain.map(r => ({ ...r, liked_by_me: false }))

  const ids = plain.map(r => r.id).filter(n => Number.isFinite(n)) as number[]
  if (ids.length === 0)
    return plain.map(r => ({ ...r, liked_by_me: false }))

  const likedRows = await (db.selectFrom('judge_reviews_likes' as any) as any)
    .select('judge_review_id')
    .where('user_id' as any, '=', userId)
    .where('judge_review_id' as any, 'in', ids as any)
    .execute() as Array<{ judge_review_id: number }>

  const likedSet = new Set<number>(likedRows.map(r => Number(r.judge_review_id)))

  return plain.map(r => ({ ...r, liked_by_me: likedSet.has(r.id) }))
}
