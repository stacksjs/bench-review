import type { ReviewRequest } from '../../Middleware/ViewableReview'
import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
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
      .select(['id', 'thumb_url', 'card_url', 'full_url', 'width', 'height', 'order_index'])
      .where('judge_review_id', '=', review.id)
      .orderBy('order_index', 'asc')
      .execute() as Array<Record<string, any>>

    // Judge right-of-reply. The judge's official response to this review
    // (admin-posted on their behalf), rendered prominently under the body.
    // Null when the judge hasn't responded. Defensive try/catch so a
    // pre-migrate environment (judge_responses table not yet created)
    // degrades to "no response" instead of 500-ing the whole article.
    let judgeResponse: { body: string, judge_name: string | null, responded_at: string | null } | null = null
    try {
      const responseRow = await db.selectFrom('judge_responses')
        .select(['body', 'created_at', 'updated_at'])
        .where('judge_review_id', '=', review.id)
        .executeTakeFirst() as { body: string, created_at: string | null, updated_at: string | null } | undefined
      if (responseRow) {
        judgeResponse = {
          body: responseRow.body,
          judge_name: judge?.name ?? null,
          responded_at: responseRow.updated_at ?? responseRow.created_at,
        }
      }
    }
    catch {
      // judge_responses not migrated yet — no response to show.
    }

    // Can the current viewer respond AS the judge? True only for a verified
    // judge whose claimed profile matches this review's judge — drives the
    // inline "Respond as the judge" composer on the article. Defensive +
    // anonymous-tolerant (no viewer → false).
    let canRespondAsJudge = false
    try {
      const me = await Auth.user().catch(() => null)
      const meId = (me as any)?.id
      if (meId && review.judge_id != null) {
        const u = await db.selectFrom('users')
          .select(['credential_type', 'credential_verified_at', 'claimed_judge_id'])
          .where('id', '=', Number(meId))
          .executeTakeFirst() as { credential_type: string | null, credential_verified_at: string | null, claimed_judge_id: number | null } | undefined
        canRespondAsJudge = !!u
          && u.credential_type === 'judge'
          && u.credential_verified_at != null
          && u.claimed_judge_id != null
          && Number(u.claimed_judge_id) === Number(review.judge_id)
      }
    }
    catch {
      // anonymous or claim columns not migrated — no judge composer.
    }

    return response.json({ ...hydrated, judge, author, photos, response: judgeResponse, can_respond_as_judge: canRespondAsJudge })
  },
})
