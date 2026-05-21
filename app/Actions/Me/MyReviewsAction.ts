import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'

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

    // Join each row to its judge (one extra query per distinct judge,
    // not per row — small datasets, cheap enough not to optimise).
    const judgeIds = Array.from(new Set(rows.map(r => r.judge_id).filter((v: any) => v != null)))
    const judges = judgeIds.length > 0
      ? await Judge.whereIn('id', judgeIds).get() as Array<Record<string, any>>
      : []
    const judgesById: Record<number, any> = {}
    for (const j of judges)
      judgesById[j.id as number] = j

    const enriched = rows.map(r => ({
      ...r,
      judge: r.judge_id != null ? (judgesById[r.judge_id as number] ?? null) : null,
    }))

    return response.json(enriched)
  },
})
