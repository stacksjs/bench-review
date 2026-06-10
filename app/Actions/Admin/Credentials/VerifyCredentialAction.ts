import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/credentials/{userId}/verify — admin approves a
 * credential claim. Or, with `action: 'reject'` + `note: '...'`,
 * rejects it with a reason (bench-review#37).
 *
 * Auth + admin middleware on the route. Audit trail captured in
 * `credential_verified_by_user_id` so a future "who approved which
 * claims" report is straightforward.
 *
 * Idempotent on approve — a second approve call re-stamps the
 * timestamps but doesn't double-credit.
 */
export default new Action({
  name: 'Admin Verify Credential',
  description: 'Approve or reject a self-declared credential claim',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const adminId = (me as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated' }, 401)

    const targetUserId = Number(request.params?.id)
    const action = String(request.get?.('action') ?? '').trim().toLowerCase()

    if (action !== 'approve' && action !== 'reject')
      return response.json({ error: 'action must be "approve" or "reject".' }, 422)

    const target = await db.selectFrom('users')
      .select(['id', 'credential_claimed_at', 'credential_type', 'claimed_judge_id'])
      .where('id', '=', targetUserId)
      .executeTakeFirst() as { id: number, credential_claimed_at: string | null, credential_type: string | null, claimed_judge_id: number | null } | undefined

    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    if (!target.credential_claimed_at)
      return response.json({ error: 'User has not claimed a credential yet.' }, 422)

    const now = new Date().toISOString()

    if (action === 'approve') {
      // A judge profile can only have one verified holder. The partial
      // unique index (migration 1780917026) enforces it at the DB; this
      // re-check at approval time turns a constraint 500 into a clear
      // 409 and names the conflict. The claim-time check in
      // ClaimJudgeProfileAction can't cover the case where two users
      // claim the same judge and an admin approves the second one.
      if (target.credential_type === 'judge' && target.claimed_judge_id != null) {
        const holders = await db.selectFrom('users')
          .select(['id'])
          .where('claimed_judge_id', '=', target.claimed_judge_id)
          .where('credential_type', '=', 'judge')
          .where('credential_verified_at', 'is not', null)
          .execute() as Array<{ id: number }>
        // `!=` isn't a supported bqb operator here, so exclude the
        // target in JS rather than in the query.
        const conflict = holders.find(h => Number(h.id) !== targetUserId)
        if (conflict)
          return response.json({ error: 'Another verified user already holds this judge profile. Reject one of the claims first.' }, 409)
      }
      await db.updateTable('users')
        .set({
          credential_verified_at: now,
          credential_verified_by_user_id: Number(adminId),
          credential_rejection_note: null,
          updated_at: now,
        } as any)
        .where('id', '=', targetUserId)
        .execute()
      await logModeration({
        actorUserId: Number(adminId),
        action: 'credential.approve',
        targetType: 'credential',
        targetId: targetUserId,
      })
      return response.json({ ok: true, status: 'approved', verified_at: now })
    }

    // reject branch
    const note = String(request.get?.('note') ?? '').trim().slice(0, 1000)
    if (!note)
      return response.json({ error: 'Rejection requires a `note` explaining why.' }, 422)

    await db.updateTable('users')
      .set({
        credential_verified_at: null,
        credential_verified_by_user_id: null,
        credential_rejection_note: note,
        updated_at: now,
      } as any)
      .where('id', '=', targetUserId)
      .execute()
    await logModeration({
      actorUserId: Number(adminId),
      action: 'credential.reject',
      targetType: 'credential',
      targetId: targetUserId,
      note,
    })
    return response.json({ ok: true, status: 'rejected', note })
  },
})
