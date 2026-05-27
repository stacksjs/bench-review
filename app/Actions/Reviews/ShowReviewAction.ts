import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'
import { publicReviewerFor } from '../../Helpers/reviewerLabel'

/**
 * GET /api/reviews/:id — one review with judge context.
 *
 * Visibility rules:
 *   - Published: everyone (public route).
 *   - Pending / rejected: ONLY the author. The notification dropdown
 *     deep-links the author into their own pending or rejected
 *     article — 404'ing them on their own content was misleading.
 *     For anyone else, the row stays invisible (still 404) so a
 *     guessed-id can't surface unmoderated content.
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
    const raw = String((request as any).params?.id || '')
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0)
      return response.json({ error: 'Invalid review id' }, 400)

    const review = await JudgeReview.where('id', id).first()
    if (!review)
      return response.json({ error: 'Not Found' }, 404)

    const status = (review as any).status as string
    const authorId = (review as any).user_id as number | null

    // Author-view exception: pending/rejected rows visible to the
    // author only. Everyone else gets a 404 — same response shape as
    // a missing row so non-existence and access-denial are
    // indistinguishable from outside.
    if (status !== 'published') {
      let viewerId: number | null = null
      try {
        const me = await Auth.user()
        viewerId = (me as any)?.id ?? null
      }
      catch { /* anonymous — viewerId stays null */ }

      if (authorId == null || viewerId == null || Number(viewerId) !== Number(authorId))
        return response.json({ error: 'Not Found' }, 404)
    }

    const [hydrated] = await hydrateLikeData([review as any])

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
        const isViewerAuthor = false
        // Viewer-is-author already short-circuited above for non-
        // published reviews. For published rows, check explicitly so
        // the author sees their own identity even on the public page.
        const viewerIsAuthor = await Auth.user()
          .then(me => me && Number((me as any).id) === Number(authorId))
          .catch(() => false)

        if (viewerIsAuthor) {
          author = { id: ur.id, name: ur.name, role_label: ur.role_label ?? null }
        }
        else {
          author = publicReviewerFor(hydrated as any, ur)
        }
      }
    }

    return response.json({ ...hydrated, judge, author })
  },
})
