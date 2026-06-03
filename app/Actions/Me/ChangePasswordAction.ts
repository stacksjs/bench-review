import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { makeHash, verifyHash } from '@stacksjs/security'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/me/password — authenticated user changes their own password.
 *
 * Mirrors the bcrypt scheme used by the rest of the auth path
 * (registration writes via `makeHash(..., { algorithm: 'bcrypt' })`,
 * login verifies via `verifyHash(...)`) — see
 * `storage/framework/core/auth/src/password/reset.ts` for the
 * established pattern.
 *
 * Resolves bench-review#42 — the settings form's save handler was a
 * `setTimeout` stub waiting for this endpoint.
 *
 * Security notes:
 *   - Current-password mismatch returns a generic 422 with no signal
 *     about whether the email is registered or not (it's the user's
 *     own session — no enumeration risk anyway, but we keep the error
 *     shape uniform across the password endpoints).
 *   - `verifyHash` is constant-time-by-spec under bcrypt; no
 *     hand-rolled compare.
 *   - We do NOT revoke other personal-access tokens by default.
 *     Some users (mobile clients, IDE plugins, multi-device) would be
 *     bricked by a silent revoke. A future "Sign me out everywhere"
 *     toggle on the settings UI can opt into the broader revoke; for
 *     now this endpoint only mutates the password column.
 */
export default new Action({
  name: 'Change My Password',
  description: 'Verify the current password and replace it with a new one',
  method: 'PATCH',
  validations: {
    current_password: {
      rule: schema.string().min(1),
      message: 'Current password is required.',
    },
    new_password: {
      rule: schema.string().min(8).max(255),
      message: 'New password must be at least 8 characters.',
    },
    new_password_confirmation: {
      rule: schema.string().min(1),
      message: 'Please confirm the new password.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const currentPassword = String(request.get?.('current_password') ?? '')
    const newPassword = String(request.get?.('new_password') ?? '')
    const newPasswordConfirmation = String(request.get?.('new_password_confirmation') ?? '')

    if (newPassword !== newPasswordConfirmation)
      return response.json({ error: 'New password and confirmation do not match.' }, 422)

    if (newPassword === currentPassword)
      return response.json({ error: 'New password must be different from the current one.' }, 422)

    // Pull the stored hash directly off the users row. We don't trust
    // `authUser.password` to be present in every code path — some auth
    // providers strip it from the in-memory record.
    const row = await db.selectFrom('users')
      .select(['id', 'password'])
      .where('id', '=', Number(userId))
      .executeTakeFirst() as { id: number, password: string } | undefined

    if (!row?.password)
      return response.json({ error: 'Unable to verify password.' }, 422)

    const ok = await verifyHash(currentPassword, row.password)
    if (!ok)
      return response.json({ error: 'Current password is incorrect.' }, 422)

    const nextHash = await makeHash(newPassword, { algorithm: 'bcrypt' })

    await db.updateTable('users')
      .set({ password: nextHash, updated_at: new Date().toISOString() } as any)
      .where('id', '=', Number(userId))
      .execute()

    return response.json({ ok: true })
  },
})
