import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/comments — comments for moderation, most recent first.
 *
 * Query: `status` ('published' | 'rejected' | 'all', default 'published').
 * Published first by default because that is the set that is live on the
 * site: moderation here is about what readers can currently see, not a
 * backlog to work down.
 *
 * Capped at 200. Author and parent-review context are resolved in separate
 * queries rather than joined (bqb does not surface `.leftJoin()` —
 * stacksjs/bun-query-builder#1023), collapsed to one lookup each rather
 * than one per row.
 *
 * Shows the real author name, unlike the public endpoint: a moderator
 * deciding whether a comment is harassment needs to know who wrote it and
 * whether the same person is doing it repeatedly. `anonymized` rides along
 * so the UI can show that the public sees it unattributed.
 *
 * bench-review#51.
 */
const STATUSES = ['published', 'rejected'] as const

export default new Action({
  name: 'Admin Comment Index',
  description: 'List comments for moderation',
  method: 'GET',
  async handle() {
    const statusRaw = String(request.get?.('status') ?? 'published').trim().toLowerCase()

    let query: any = db.selectFrom('review_comments')
      .select(['id', 'body', 'status', 'judge_review_id', 'user_id', 'anonymized', 'created_at'])

    // WHERE before orderBy — bqb emits clauses in chain-call order (same
    // caveat as UserIndexAction and the submissions queue).
    if ((STATUSES as readonly string[]).includes(statusRaw))
      query = query.where('status', '=', statusRaw)

    const rows = await query
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute() as Array<Record<string, any>>

    const userIds = Array.from(new Set(rows.map(r => Number(r.user_id)).filter(Boolean)))
    const nameById = new Map<number, string>()
    if (userIds.length > 0) {
      const users = await db.selectFrom('users')
        .select(['id', 'name', 'email'])
        .where('id', 'in', userIds as any)
        .execute() as Array<{ id: number, name: string | null, email: string | null }>
      for (const u of users)
        nameById.set(Number(u.id), u.name || u.email || `User #${u.id}`)
    }

    const reviewIds = Array.from(new Set(rows.map(r => Number(r.judge_review_id)).filter(Boolean)))
    const reviewById = new Map<number, { id: number, title: string | null }>()
    if (reviewIds.length > 0) {
      const reviews = await db.selectFrom('judge_reviews')
        .select(['id', 'title'])
        .where('id', 'in', reviewIds as any)
        .execute() as Array<{ id: number, title: string | null }>
      for (const r of reviews)
        reviewById.set(Number(r.id), { id: Number(r.id), title: r.title })
    }

    const comments = rows.map(r => ({
      id: Number(r.id),
      body: String(r.body ?? ''),
      status: String(r.status ?? 'published'),
      judge_review_id: r.judge_review_id == null ? null : Number(r.judge_review_id),
      anonymized: !!r.anonymized,
      created_at: r.created_at ?? null,
      author: r.user_id == null
        ? null
        : { id: Number(r.user_id), name: nameById.get(Number(r.user_id)) ?? `User #${r.user_id}` },
      review: r.judge_review_id == null ? null : (reviewById.get(Number(r.judge_review_id)) ?? null),
    }))

    return response.json({ comments })
  },
})
