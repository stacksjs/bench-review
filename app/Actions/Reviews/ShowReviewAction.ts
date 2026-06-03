import type { ReviewRequest } from '../../Middleware/ViewableReview'
import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'
import { publicReviewerFor } from '../../Helpers/reviewerLabel'

/**
 * GET /api/reviews/:id — one review with judge context.
 *
 * Authorization (the published-OR-author 404 gate) and loading the row
 * live in the `viewable-review` middleware (app/Middleware/ViewableReview.ts),
 * which stashes the row and `_viewerIsAuthor` on the request. This action
 * is pure presentation: hydrate likes, attach the judge + author payload,
 * attach photos.
 *
 * Returns a flat row plus a nested `judge` object so the article view
 * can render header + body in a single response. `likes` and
 * `liked_by_me` are hydrated via the same helper used by the list
 * endpoints — single-row case is a degenerate page-of-one; reusing
 * the helper keeps the count source consistent across every read path.
 */
export default new Action({
  name: 'Show Review',
  description: 'One review with judge context (author can see their own pending/rejected)',
  method: 'GET',
  async handle() {
    // The middleware proxies these markers onto the request; the proxy
    // forwards them verbatim (router/src/request-context.ts), so there's
    // no re-query and no re-resolution of the viewer here. The cast
    // bridges the singleton's static `RequestInstance` type to the
    // runtime `EnhancedRequest` that actually carries the markers.
    const req = request as unknown as ReviewRequest
    const review = req._review
    const viewerIsAuthor = req._viewerIsAuthor === true
    if (!review)
      return response.json({ error: 'Not Found' }, 404)

    const authorId = review.user_id

    const [hydrated] = await hydrateLikeData([review])
    if (!hydrated)
      return response.json({ error: 'Not Found' }, 404)

    let judge: any = null
    if (hydrated.judge_id) {
      const j = await Judge.where('id', hydrated.judge_id).first()
      if (j) {
        const jr = (j as any).toJSON ? (j as any).toJSON() : j
        judge = { id: jr.id, name: jr.name, court: jr.court ?? null, image_url: jr.image_url ?? null }
      }
    }

    // Author payload with anonymity gating (bench-review#36).
    //
    // The viewer's relationship to the row drives whether they see
    // the real author or the public-anon substitute:
    //   - the author themselves → real name (so /my-reviews and
    //     hard-reload on their own article still feel personal)
    //   - everyone else → publicReviewerFor() applies the flag
    //
    // `publicReviewerFor` returns `id: null` for anonymous reviews
    // — that's intentional so anonymous reviewer rows can't link
    // back to `/user/{id}` by construction. Belt + suspenders: the
    // client treats null-id as "no profile link".
    let author: { id: number | null, name: string, role_label: string | null } | null = null
    if (authorId != null) {
      const u = await User.where('id', Number(authorId)).first()
      if (u) {
        const ur = (u as any).toJSON ? (u as any).toJSON() : u
        // `viewerIsAuthor` was resolved once in the middleware and
        // stashed — no second Auth.user() round-trip. The author sees
        // their real identity (even on a published, public page); for
        // everyone else publicReviewerFor() applies the anonymity flag.
        if (viewerIsAuthor)
          author = { id: ur.id, name: ur.name, role_label: ur.role_label ?? null }
        else
          author = publicReviewerFor(hydrated as any, ur)
      }
    }

    // Attached photos (bench-review#31). Empty array when no
    // uploads exist; the article gallery hides itself in that case.
    // Ordered by `order_index` so author-specified gallery order is
    // honoured.
    const photos = await db.selectFrom('review_photos')
      .select(['id', 'thumb_url', 'card_url', 'full_url', 'width', 'height', 'order_index'] as any)
      .where('judge_review_id', '=', review.id)
      .orderBy('order_index', 'asc')
      .execute() as Array<Record<string, any>>

    return response.json({ ...hydrated, judge, author, photos })
  },
})
