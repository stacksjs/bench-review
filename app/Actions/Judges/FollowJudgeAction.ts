import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/judges/{id}/follow — current user follows the given judge.
 *
 * Idempotent: a duplicate follow is a no-op rather than a 409. The
 * unique index `(user_id, judge_id)` on `judge_follows` enforces this
 * at the storage layer; we catch the resulting constraint error and
 * return success so the client UI doesn't need to special-case "already
 * following".
 *
 * Declarative `validations` covers the path-param `id` (merged into
 * the framework's `input` along with query + body) — path-param
 * strings are now auto-coerced to numbers when the rule expects one,
 * see stacks-router.ts:getRequestInput + stacksjs/stacks#1865.
 */
export default new Action({
  name: 'Follow Judge',
  description: 'Add the current user to the given judge\'s followers',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid judge id.',
    },
  },
  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    // Route params come through `(request as any).params` in this
    // framework — mirrors ShowReviewAction / ReviewsByJudgeAction. The
    // declarative `validations` above already proved the value is a
    // positive number; this just casts it.
    const judgeId = Number((request as any).params?.id)

    const judge = await Judge.find(judgeId)
    if (!judge)
      return response.json({ error: 'Judge not found' }, 404)

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
