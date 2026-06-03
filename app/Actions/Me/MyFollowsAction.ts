import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/me/follows — judge IDs the current user follows.
 *
 * Returns just the IDs (not full judge rows) so the client can flip
 * per-judge "Follow / Following" UI without paying for a join the
 * caller may not need. The judges store already caches full judge
 * records — combine with `myFollows` in the follows store to render
 * a full followed-judges list when needed.
 */
export default new Action({
  name: 'My Follows',
  description: 'Judge IDs the current user follows',
  method: 'GET',
  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const rows = await db.selectFrom('judge_follows')
      .select(['judge_id'])
      .where('user_id', '=', userId)
      .execute() as Array<{ judge_id: number }>

    return response.json(rows.map(r => r.judge_id))
  },
})
