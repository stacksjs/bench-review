import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * DELETE /api/judges/{id}/follow — current user stops following the
 * given judge. Idempotent: deleting a row that doesn't exist is a no-op.
 */
export default new Action({
  name: 'Unfollow Judge',
  description: 'Remove the current user from the given judge\'s followers',
  method: 'DELETE',
  async handle({ id }: { id: string | number }) {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, { status: 401 })

    const judgeId = Number(id)
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge id' }, { status: 400 })

    await db.deleteFrom('judge_follows' as any)
      .where('user_id' as any, '=', userId)
      .where('judge_id' as any, '=', judgeId)
      .execute()

    return response.json({ ok: true, following: false })
  },
})
