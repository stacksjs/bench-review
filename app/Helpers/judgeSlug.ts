import { db } from '@stacksjs/database'

/**
 * Slugs for judge profiles (bench-review#50).
 *
 * The widening migration backfilled the existing 2,740 rows in SQL; this is
 * the same rule in TypeScript, for rows created or renamed afterwards. Kept
 * deliberately close to the SQL version — lowercase, punctuation dropped,
 * whitespace collapsed to single hyphens — so a judge added through the admin
 * UI gets the same slug the import would have produced.
 */
export function slugifyJudgeName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/**
 * A slug nothing else is using.
 *
 * Same-name judges are the normal case here, not an edge case, so a collision
 * resolves by appending a counter rather than failing. `excludeId` lets an
 * edit keep its own slug instead of colliding with itself.
 *
 * There is still a unique index behind this: two admins saving at once would
 * both see the slug as free. The index is what makes that a 409 instead of
 * two judges sharing a URL.
 */
export async function uniqueJudgeSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugifyJudgeName(name) || 'judge'
  const rows = await db.selectFrom('judges')
    .select(['id', 'slug'])
    .where('slug', 'like', `${base}%`)
    .execute() as Array<{ id: number, slug: string | null }>

  const taken = new Set(
    rows
      .filter(r => excludeId == null || Number(r.id) !== Number(excludeId))
      .map(r => (r.slug ?? '').toLowerCase())
      .filter(Boolean),
  )

  if (!taken.has(base))
    return base
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate))
      return candidate
  }
  // 500 judges of one name is not a real state of the world; a random suffix
  // beats looping forever or returning something that will fail the index.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/** The lifecycle states a judge profile may carry. */
export const JUDGE_STATUSES = ['active', 'retired', 'deceased'] as const
export type JudgeStatus = (typeof JUDGE_STATUSES)[number]

export function isJudgeStatus(value: unknown): value is JudgeStatus {
  return (JUDGE_STATUSES as readonly string[]).includes(String(value ?? ''))
}
