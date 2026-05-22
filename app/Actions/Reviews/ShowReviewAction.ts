import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/reviews/:id — one published review, joined with its judge.
 *
 * Returns a flat row plus a nested `judge` object so the article view
 * can render header + body in a single response. Judge data is read
 * via a separate query rather than a SQL JOIN because the ORM's join
 * surface is rough and the cost of two indexed lookups is negligible
 * for a single-row read.
 *
 * If the request carries an auth token, hydrates `liked_by_me` so the
 * article view can paint the "people find this helpful" button in its
 * correct state on hard reload. Anonymous reads leave `liked_by_me`
 * false — the UI then prompts the user to sign in on first click.
 *
 * Returns 404 for missing or non-published rows so unmoderated content
 * doesn't accidentally surface via a guessed id.
 */
export default new Action({
  name: 'Show Review',
  description: 'One published review with judge context',
  method: 'GET',
  async handle() {
    const raw = String((request as any).params?.id || '')
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0)
      return response.json({ error: 'Invalid review id' }, 400)

    const review = await JudgeReview.where('id', id)
      .where('status', 'published')
      .first()
    if (!review)
      return response.json({ error: 'Not Found' }, 404)

    const row = (review as any).toJSON ? (review as any).toJSON() : review

    let judge: any = null
    if (row.judge_id) {
      const j = await Judge.where('id', row.judge_id).first()
      if (j) {
        const jr = (j as any).toJSON ? (j as any).toJSON() : j
        judge = { id: jr.id, name: jr.name, court: jr.court ?? null, image_url: jr.image_url ?? null }
      }
    }

    // Resolve `liked_by_me` only when the caller is authenticated.
    // Anonymous reads don't trigger the lookup — saves a query on the
    // public-feed click-through path. `Auth.user()` reads bearer-token
    // only (see authentication.ts:291), which matches how every other
    // user-scoped lookup in this app resolves the current user.
    let likedByMe = false
    try {
      const authUser = await Auth.user()
      const userId = (authUser as any)?.id
      if (userId) {
        const likeable = (JudgeReview as any)._likeable
        if (likeable)
          likedByMe = await likeable.isLiked(id, userId)
      }
    }
    catch {
      // Auth resolution failed — fall through with likedByMe=false. A
      // broken token shouldn't 500 a public page read.
    }

    return response.json({ ...row, judge, liked_by_me: likedByMe })
  },
})
