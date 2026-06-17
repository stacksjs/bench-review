import { Action } from '@stacksjs/actions'
import { Auth, isEmailVerified } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/me/judge-claim — a signed-in user claims a judge profile
 * (the /judges/signup flow).
 *
 * Rides the existing credential rails so it reuses the admin verification
 * queue: sets `credential_type = 'judge'` + `claimed_judge_id` and stamps
 * `credential_claimed_at` (pending). An admin then approves it via the
 * same `VerifyCredentialAction`; only then is the user a "verified judge"
 * who can respond to reviews of that profile (see SubmitJudgeResponseAction).
 *
 * Identity is confirmed out-of-band by the admin — anyone can submit a
 * claim, nobody can act on it until verified.
 */
export default new Action({
  name: 'Claim Judge Profile',
  description: 'Claim a judge profile (pending admin verification)',
  method: 'POST',
  validations: {
    judgeId: {
      rule: schema.number().positive(),
      message: 'A valid judge must be selected.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const userId = (me as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated.' }, 401)

    // Email-verification gate — same trust posture as review submission
    // (SubmitReviewAction). Don't let unverified accounts queue admin work:
    // a judge claim enters the credential-verification queue.
    if (!isEmailVerified(me as any))
      return response.json({ error: 'Please verify your email address before claiming a judge profile — check your inbox for the verification link.' }, 403)

    const judgeId = Number(request.get?.('judgeId'))
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'A valid judge must be selected.' }, 422)

    const judge = await db.selectFrom('judges')
      .select(['id', 'name'])
      .where('id', '=', judgeId)
      .executeTakeFirst() as { id: number, name: string } | undefined
    if (!judge)
      return response.json({ error: 'Judge not found.' }, 404)

    // Block if another user already holds a VERIFIED claim on this judge.
    // (Filter in JS to avoid bqb null-operator quirks.)
    const claimants = await db.selectFrom('users')
      .select(['id', 'credential_verified_at'])
      .where('claimed_judge_id', '=', judgeId)
      .where('credential_type', '=', 'judge')
      .execute() as Array<{ id: number, credential_verified_at: string | null }>
    const takenByOther = claimants.some(u => Number(u.id) !== Number(userId) && u.credential_verified_at != null)
    if (takenByOther)
      return response.json({ error: 'This judge profile has already been claimed and verified by someone else.' }, 409)

    // Stamp the claim — pending until an admin verifies. Clear any prior
    // verification so re-claiming (a different profile, or after a reject)
    // re-enters the queue cleanly.
    await db.updateTable('users')
      .set({
        claimed_judge_id: judgeId,
        credential_type: 'judge',
        credential_claimed_at: new Date().toISOString(),
        credential_verified_at: null,
        credential_verified_by_user_id: null,
        credential_rejection_note: null,
      } as any)
      .where('id', '=', Number(userId))
      .execute()

    return response.json({ ok: true, judge: { id: judge.id, name: judge.name }, state: 'pending' })
  },
})
