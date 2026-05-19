import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * POST /api/judges/{id}/follow — current user follows the given judge.
 *
 * Idempotent: a duplicate follow is a no-op rather than a 409. The
 * unique index `(user_id, judge_id)` on `judge_follows` enforces this
 * at the storage layer; we catch the resulting constraint error and
 * return success so the client UI doesn't need to special-case "already
 * following".
 */
export default new Action({
  name: 'Follow Judge',
  description: 'Add the current user to the given judge\'s followers',
  method: 'POST',
  async handle({ id }: { id: string | number }) {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, { status: 401 })

    const judgeId = Number(id)
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge id' }, { status: 400 })

    const judge = await Judge.find(judgeId)
    if (!judge)
      return response.json({ error: 'Judge not found' }, { status: 404 })

    try {
      await db.insertInto('judge_follows' as any).values({
        user_id: userId,
        judge_id: judgeId,
      } as any).execute()
    }
    catch (err: any) {
      // SQLite unique constraint violation — already following.
      // Anything else: surface so we don't silently swallow a real bug.
      const msg = String(err?.message || err)
      if (!/UNIQUE constraint failed/i.test(msg))
        throw err
    }

    return response.json({ ok: true, following: true })
  },
})
