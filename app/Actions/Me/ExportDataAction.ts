import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/me/export — the authenticated user downloads everything we hold
 * about them as JSON (data-portability / privacy-policy compliance).
 *
 * Profile excludes the password hash; the rest is the user's own content,
 * pulled per table by `user_id`. Best-effort per table so a missing one on a
 * given env doesn't fail the whole export. The frontend saves the payload as
 * a file.
 */
export default new Action({
  name: 'Export My Data',
  description: 'Download the authenticated user\'s data as JSON',
  method: 'GET',

  async handle() {
    const me = await Auth.user()
    const userId = (me as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const id = Number(userId)

    const profile = await db.selectFrom('users')
      .select([
        'id', 'name', 'email', 'role_label',
        'credential_type', 'credential_state', 'credential_claimed_at', 'credential_verified_at',
        'claimed_judge_id', 'email_verified_at', 'created_at', 'updated_at',
      ])
      .where('id', '=', id)
      .executeTakeFirst()
      .catch(() => null)

    const pull = async (table: string): Promise<unknown[]> =>
      await db.selectFrom(table as any).selectAll().where('user_id', '=', id).execute().catch(() => [])

    const [reviews, comments, follows, flags, photos, drafts] = await Promise.all([
      pull('judge_reviews'),
      pull('review_comments'),
      pull('judge_follows'),
      pull('review_flags'),
      pull('review_photos'),
      pull('review_drafts'),
    ])

    return response.json({
      exported_at: new Date().toISOString(),
      profile,
      reviews,
      comments,
      follows,
      flags,
      photos,
      drafts,
    })
  },
})
