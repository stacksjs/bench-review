import { Action } from '@stacksjs/actions'
import { request, response } from '@stacksjs/router'
import { hydrateLikedByMe } from '../../Helpers/reviewLikes'

/**
 * GET /api/judges/:id/reviews — list published reviews for one judge.
 *
 * Lazy by design: the directory page (`/api/judges`) returns judges
 * WITHOUT review aggregates, and the judge profile pulls this endpoint
 * only when its reviews tab actually renders. Keeps the directory
 * payload small and avoids a JOIN that would scale poorly.
 *
 * Returns published reviews only — pending/rejected stay invisible
 * to the public. `liked_by_me` is hydrated per row when the request
 * carries an auth token.
 */
export default new Action({
  name: 'Reviews By Judge',
  description: 'List published reviews for a single judge',
  method: 'GET',
  async handle() {
    // `(request as any).params.id` mirrors the pattern used by the
    // framework default `InboxShowAction` — see its comment for why
    // we read directly off the proxy rather than `request.getParam`.
    const raw = String((request as any).params?.id || '')
    const judgeId = Number(raw)
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge id' }, 400)

    const rows = await JudgeReview.where('judge_id', judgeId)
      .where('status', 'published')
      .orderBy('created_at', 'desc')
      .get()

    const hydrated = await hydrateLikedByMe(rows ?? [])
    return response.json(hydrated)
  },
})
