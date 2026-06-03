import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * DELETE /api/judges/{id}/follow — current user stops following the
 * given judge. Idempotent: deleting a row that doesn't exist is a no-op.
 *
 * Declarative `validations` covers the path-param `id` (auto-coerced
 * from string by the framework, see stacksjs/stacks#1865).
 */
export default new Action({
  name: 'Unfollow Judge',
  description: 'Remove the current user from the given judge\'s followers',
  method: 'DELETE',
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

    const judgeId = Number(request.params?.id)

    await db.deleteFrom('judge_follows')
      .where('user_id', '=', userId)
      .where('judge_id', '=', judgeId)
      .execute()

    return response.json({ ok: true, following: false })
  },
})
