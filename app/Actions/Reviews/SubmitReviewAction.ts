import { Action } from '@stacksjs/actions'
import { request, response } from '@stacksjs/router'

interface SubmitPayload {
  judge_id?: number
  title?: string
  content?: string
  rating?: number
  type?: 'positive' | 'negative' | 'neutral'
}

/**
 * POST /api/reviews — submit a new review.
 *
 * Auth-gated at the route layer (`auth` middleware from
 * `resources/middleware/auth.ts`). The handler still treats the
 * request body as untrusted and validates the shape itself.
 *
 * Status flows in as `pending` so moderation stays manual until
 * an automated review pipeline lands. The front-end shows the
 * "thanks, we'll review it shortly" copy after submit and the row
 * stays invisible to other sessions until a moderator publishes it.
 */
export default new Action({
  name: 'Submit Review',
  description: 'Persist a user-submitted review (status=pending)',
  method: 'POST',
  async handle() {
    const body: SubmitPayload = typeof (request as any).all === 'function'
      ? (request as any).all()
      : {}

    const judgeId = Number(body.judge_id)
    const rating = Number(body.rating)
    const title = String(body.title ?? '').trim()
    const content = String(body.content ?? '').trim()
    const type = body.type ?? 'neutral'

    const errors: Record<string, string> = {}
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      errors.judge_id = 'Pick a judge before submitting.'
    if (title.length < 3 || title.length > 255)
      errors.title = 'Title must be between 3 and 255 characters.'
    if (content.length < 10 || content.length > 1000)
      errors.content = 'Review must be between 10 and 1000 characters.'
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      errors.rating = 'Pick a rating between 1 and 5 stars.'
    if (!['positive', 'negative', 'neutral'].includes(type))
      errors.type = 'Invalid review type.'

    if (Object.keys(errors).length > 0)
      return response.json({ error: 'Validation failed', errors }, { status: 422 })

    // Verify the judge exists. Cheap (PK lookup) and avoids writing a
    // review against a stale/deleted judge id.
    const judge = await Judge.find(judgeId)
    if (!judge)
      return response.json({ error: 'Judge not found' }, { status: 404 })

    // `auth` middleware sets the authenticated user on the global Auth
    // helper before the action runs (see middleware.ts:35). We pull the
    // id here so /api/me/reviews can filter by author later.
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id ?? null

    const review = await JudgeReview.create({
      title,
      content,
      rating,
      type,
      status: 'pending',
      likes: 0,
      comments: 0,
      judge_id: judgeId,
      user_id: userId,
    })

    return response.json({ ok: true, review }, { status: 201 })
  },
})
