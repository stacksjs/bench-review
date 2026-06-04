import type { EnhancedRequest } from '@stacksjs/bun-router'
import { Auth } from '@stacksjs/auth'
import { HttpError } from '@stacksjs/error-handling'
import { Middleware } from '@stacksjs/router'

/**
 * Shape of the row stashed on the request for ShowReviewAction. We
 * narrow to the columns the gate + action actually read and let the rest
 * flow through the index
 * signature — honest typing without leaking `any` to the read site.
 */
export interface StashedReview {
  id: number
  status: string
  user_id: number | null
  judge_id: number | null
  // Remaining columns are spread into the response untouched.
  [column: string]: unknown
}

/**
 * The request with the markers this middleware stashes. An explicit
 * intersection (rather than `declare module` augmentation of
 * EnhancedRequest) keeps the typing deterministic across the symlinked
 * package boundary — both writer (here) and reader (ShowReviewAction)
 * cast to this and stay `any`-free.
 */
export type ReviewRequest = EnhancedRequest & {
  /** Review loaded + visibility-checked by the ViewableReview middleware. */
  _review?: StashedReview
  /** True when the current viewer authored `_review`. */
  _viewerIsAuthor?: boolean
}

/**
 * ViewableReview — visibility gate for `GET /api/reviews/{id}`.
 *
 * The rule, lifted verbatim out of ShowReviewAction:
 *   - published          → everyone
 *   - pending / rejected → the author only; everyone else gets a 404
 *     in the same shape as a missing row, so a guessed id can't probe
 *     for unmoderated content.
 *
 * Loads the row once and resolves the viewer once, then stashes both
 * the review and `viewerIsAuthor` on the request. The action reads them
 * back through the request proxy, which forwards middleware-injected
 * properties verbatim (router/src/request-context.ts), so there's no
 * second query and no second `Auth.user()` call. Authorization lives
 * here; the action is left with pure presentation.
 *
 * `JudgeReview` is a runtime global (typed in
 * storage/framework/types/user-models.d.ts), so it needs no import.
 */
export default new Middleware({
  name: 'viewable-review',
  priority: 10,
  async handle(request) {
    const id = Number(request.params?.id)
    if (!Number.isFinite(id) || id <= 0)
      throw new HttpError(400, 'Invalid review id')

    const review = await JudgeReview.where('id', id).first() as StashedReview | null
    if (!review)
      throw new HttpError(404, 'Not Found')

    // Resolve the viewer once. Anonymous is fine — viewerId stays null.
    let viewerId: number | null = null
    try {
      const me = await Auth.user()
      viewerId = (me?.id as number | undefined) ?? null
    }
    catch {
      // anonymous — viewerId stays null
    }

    const authorId = review.user_id
    const viewerIsAuthor = authorId != null && viewerId != null && Number(viewerId) === Number(authorId)

    if (review.status !== 'published' && !viewerIsAuthor)
      throw new HttpError(404, 'Not Found')

    const req = request as ReviewRequest
    req._review = review
    req._viewerIsAuthor = viewerIsAuthor
  },
})
