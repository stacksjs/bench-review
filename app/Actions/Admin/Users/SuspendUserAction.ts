import { Action } from '@stacksjs/actions'
import { Auth, revokeAllTokens } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/users/{id}/suspend — suspend or reinstate an account.
 *
 * Body: `action: 'suspend' | 'unsuspend'`, optional `reason`.
 *
 * Suspension is a reversible alternative to the hard-delete that was
 * previously the only moderation lever. It sets `banned_at` (and an
 * optional reason) rather than destroying the account, which:
 *   - preserves the user's reviews/flags as evidence,
 *   - keeps the email row in place so the UNIQUE(email) index blocks
 *     re-registration with the same address, and
 *   - is fully reversible.
 *
 * The Auth middleware rejects requests from a banned account, and we
 * also revoke the user's tokens here so existing sessions die at once.
 */
export default new Action({
  name: 'Admin Suspend User',
  description: 'Suspend or reinstate a user account (reversible)',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const targetUserId = Number(request.params?.id)

    const me = await Auth.user()
    const adminId = (me as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated' }, 401)
    if (Number(adminId) === targetUserId)
      return response.json({ error: 'You cannot suspend your own account.' }, 422)

    const action = String(request.get?.('action') ?? '').trim().toLowerCase()
    if (action !== 'suspend' && action !== 'unsuspend')
      return response.json({ error: 'action must be "suspend" or "unsuspend".' }, 422)

    const target = await db.selectFrom('users')
      .select(['id', 'email'])
      .where('id', '=', targetUserId)
      .executeTakeFirst() as { id: number, email: string | null } | undefined
    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    const now = new Date().toISOString()

    if (action === 'suspend') {
      const reason = String(request.get?.('reason') ?? '').trim().slice(0, 1000) || null
      await db.updateTable('users')
        .set({ banned_at: now, banned_reason: reason, updated_at: now } as any)
        .where('id', '=', targetUserId)
        .execute()

      // Kill existing sessions so the suspension takes effect immediately,
      // not just on the next login attempt. Best-effort.
      try {
        await revokeAllTokens(targetUserId)
      }
      catch (err) {
        console.warn('[suspend-user] revokeAllTokens failed — user still suspended.', err instanceof Error ? err.message : err)
      }

      await logModeration({
        actorUserId: Number(adminId),
        action: 'user.suspend',
        targetType: 'user',
        targetId: targetUserId,
        note: reason ?? undefined,
      })
      return response.json({ ok: true, status: 'suspended', banned_at: now })
    }

    // unsuspend
    await db.updateTable('users')
      .set({ banned_at: null, banned_reason: null, updated_at: now } as any)
      .where('id', '=', targetUserId)
      .execute()
    await logModeration({
      actorUserId: Number(adminId),
      action: 'user.unsuspend',
      targetType: 'user',
      targetId: targetUserId,
    })
    return response.json({ ok: true, status: 'active' })
  },
})
