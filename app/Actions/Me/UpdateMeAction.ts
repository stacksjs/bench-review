import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/me — authenticated user updates their own profile.
 *
 * Currently scoped to `name`. Email is intentionally NOT editable here:
 * changing it has to re-run email verification (and the review-submission
 * gate keys off `email_verified_at`), so a bare update would either skip
 * verification or silently lock the user out of posting. Until that flow
 * exists the settings UI shows email as read-only. See bench-review#57.
 */
export default new Action({
  name: 'Update Me',
  description: 'Update the current user\'s editable profile fields',
  method: 'PATCH',
  validations: {
    name: {
      rule: schema.string().min(1).max(255),
      message: 'Name must be between 1 and 255 characters.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const name = String(request.get?.('name') ?? '').trim()
    if (name.length < 1)
      return response.json({ error: 'Name is required.' }, 422)

    const now = new Date().toISOString()
    await db.updateTable('users')
      .set({ name, updated_at: now } as any)
      .where('id', '=', Number(userId))
      .execute()

    return response.json({
      ok: true,
      user: {
        id: Number(userId),
        email: (authUser as any)?.email,
        name,
      },
    })
  },
})
