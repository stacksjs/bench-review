import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/flags — the moderation flag queue.
 *
 * Query: `status` ('open' | 'dismissed' | 'resolved' | 'all', default
 * 'open'). Most recent first, capped at 200.
 *
 * Flags were write-only before this: a moderator got one email on the
 * first flag and had no surface to see the rest or work them down. Each
 * row is hydrated with the flagged review's title/status/judge (resolved
 * in a second query — bqb has no join support, see #1023) so a moderator
 * has context without a click-through.
 */
const STATUSES = ['open', 'dismissed', 'resolved'] as const

export default new Action({
  name: 'Admin Flag Queue',
  description: 'List review flags for moderation, with review context',
  method: 'GET',
  async handle() {
    const statusRaw = String(request.get?.('status') ?? 'open').trim().toLowerCase()

    let query: any = db.selectFrom('review_flags')
      .select([
        'id',
        'reason',
        'details',
        'status',
        'moderator_id',
        'moderator_note',
        'judge_review_id',
        'user_id',
        'created_at',
      ])

    if ((STATUSES as readonly string[]).includes(statusRaw))
      query = query.where('status', '=', statusRaw)

    const flags = await query
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute() as Array<Record<string, any>>

    // Resolve the flagged reviews in one follow-up query and attach a
    // compact context object to each flag.
    const reviewIds = [...new Set(flags.map(f => Number(f.judge_review_id)).filter(Boolean))]
    let reviewsById: Record<number, any> = {}
    if (reviewIds.length > 0) {
      const reviews = await db.selectFrom('judge_reviews')
        .select(['id', 'title', 'status', 'judge_id'])
        .where('id', 'in', reviewIds as any)
        .execute() as Array<{ id: number, title: string | null, status: string | null, judge_id: number | null }>
      reviewsById = Object.fromEntries(reviews.map(r => [Number(r.id), r]))
    }

    const hydrated = flags.map(f => ({
      ...f,
      review: reviewsById[Number(f.judge_review_id)] ?? null,
    }))

    return response.json({ flags: hydrated })
  },
})
