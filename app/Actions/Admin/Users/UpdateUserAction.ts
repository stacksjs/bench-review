import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/admin/users/{id} — update a user's name / email.
 *
 * Body fields are optional individually; at least one must be present
 * or the request is a no-op (still 200, but indicates `updated: 0`
 * so the client knows nothing changed). Email uniqueness is enforced
 * against the existing users table — a duplicate returns 422.
 *
 * Password changes are deliberately NOT supported here. Resetting a
 * user's password is a separate flow that goes through the email-
 * reset link; admins shouldn't have a one-click "change anyone's
 * password" surface (audit, blast radius, social engineering risk).
 */
export default new Action({
  name: 'Admin Update User',
  description: 'Admin patch of a user\'s name and/or email',
  method: 'PATCH',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const userId = Number(request.params?.id)

    const nameInput = request.get?.('name')
    const emailInput = request.get?.('email')

    const patch: Record<string, unknown> = {}
    if (typeof nameInput === 'string' && nameInput.trim().length > 0)
      patch.name = nameInput.trim()
    if (typeof emailInput === 'string' && emailInput.trim().length > 0) {
      const newEmail = emailInput.trim().toLowerCase()
      // Lightweight email shape check — full validation lives in the
      // schema lib but route-level validations only cover path params
      // here. Cheap enough to do inline.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
        return response.json({ error: 'Invalid email address.' }, 422)
      patch.email = newEmail
    }

    if (Object.keys(patch).length === 0)
      return response.json({ ok: true, updated: 0 })

    const target = await db.selectFrom('users')
      .select(['id', 'email'])
      .where('id', '=', userId)
      .executeTakeFirst() as { id: number, email: string } | undefined

    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    if (patch.email && patch.email !== target.email) {
      const dupe = await db.selectFrom('users')
        .select(['id'])
        .where('email', '=', patch.email)
        .executeTakeFirst()
      if (dupe)
        return response.json({ error: 'That email is already in use.' }, 422)
    }

    await db.updateTable('users')
      .set({ ...patch, updated_at: new Date().toISOString() } as any)
      .where('id', '=', userId)
      .execute()

    const updated = await db.selectFrom('users')
      .select(['id', 'email', 'name', 'created_at', 'updated_at'])
      .where('id', '=', userId)
      .executeTakeFirst()

    return response.json({ ok: true, updated: 1, user: updated })
  },
})
