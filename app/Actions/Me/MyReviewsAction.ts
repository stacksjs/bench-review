import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { attachJudgeContext } from '../../Helpers/judgeContext'
import { hydrateLikeData } from '../../Helpers/reviewLikes'

/**
 * GET /api/me/reviews — reviews authored by the current user.
 *
 * Auth-gated at the route layer. Returns rows with `judge` joined in
 * so the profile page can render judge name/photo without a second
 * round-trip per row.
 *
 * Includes pending + published statuses — the user always sees their
 * own pending submissions in their profile even if other sessions
 * don't.
 */
export default new Action({
  name: 'My Reviews',
  description: 'Reviews authored by the current authenticated user',
  method: 'GET',
  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const rows = await JudgeReview.where('user_id', userId)
      .orderBy('created_at', 'desc')
      .get() as Array<Record<string, any>>

    if (!rows || rows.length === 0)
      return response.json([])

    // Hydrate `likes` so the profile's "total reactions received"
    // tally has real data to sum (resources/stores/profile.ts:78
    // accumulates `r.likes || 0` across this response). `liked_by_me`
    // is also returned by the helper — harmlessly true on the user's
    // own rows when they've reacted to their own review pre-author-
    // gate, false otherwise.
    const hydrated = await hydrateLikeData(rows)
    // Judge + courthouse + jurisdiction, through the shared helper the feed
    // and article page use. "My reviews" is where someone checks what they
    // wrote about whom, so naming the wrong same-name judge here is the
    // version of this bug they would notice first (bench-review#50).
    const enriched = await attachJudgeContext(hydrated)

    return response.json(enriched)
  },
})
