import { Action } from '@stacksjs/actions'
import { request, response } from '@stacksjs/router'
import { hydrateLikedByMe } from '../../Helpers/reviewLikes'

/**
 * GET /api/reviews?limit=N — latest published reviews across all judges.
 *
 * Powers the home page's "Latest reviews" strip and any other
 * cross-judge feed. Capped server-side so a forgotten limit param
 * doesn't dump the table.
 *
 * Hydrates `liked_by_me` per row when the request carries auth so the
 * feed cards paint the filled "helpful" state on first paint without
 * a follow-up round-trip.
 */
const MAX_LIMIT = 20
const DEFAULT_LIMIT = 6

export default new Action({
  name: 'Latest Reviews',
  description: 'Latest published reviews across all judges',
  method: 'GET',
  async handle() {
    const raw = (request as any).query?.limit ?? (request as any).get?.('limit')
    const parsed = Number(raw)
    const limit = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_LIMIT)
      : DEFAULT_LIMIT

    const rows = await JudgeReview.where('status', 'published')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()

    const hydrated = await hydrateLikedByMe(rows ?? [])
    return response.json(hydrated)
  },
})
