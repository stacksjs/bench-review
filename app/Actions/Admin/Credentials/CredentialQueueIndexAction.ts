import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/admin/credentials — admin queue of credential claims
 * waiting on verification (bench-review#37).
 *
 * Returns users with a non-null `credential_claimed_at` AND a null
 * `credential_verified_at` — i.e. unverified claims. Orders by
 * claim time so the oldest claim surfaces first (FIFO queue).
 *
 * Rejected claims aren't filtered out — the rejection note carries
 * the previous outcome, and the user can re-submit by editing their
 * claim (which clears both the verification + rejection fields).
 */
export default new Action({
  name: 'Admin Credential Queue',
  description: 'List users with unverified credential claims',
  method: 'GET',
  async handle() {
    const rows = await db.selectFrom('users')
      .select([
        'id', 'name', 'email',
        'credential_type', 'credential_state',
        'credential_claimed_at', 'credential_rejection_note',
        'claimed_judge_id',
      ])
      .where('credential_claimed_at', 'is not', null)
      .where('credential_verified_at', 'is', null)
      .orderBy('credential_claimed_at', 'asc')
      .execute() as Array<Record<string, any>>

    // Judge-profile claims (credential_type='judge') ride this same queue.
    // Resolve the claimed judge's name so the admin can see who is claiming
    // to be which judge before approving via VerifyCredentialAction.
    const judgeIds = Array.from(new Set(rows.map(r => r.claimed_judge_id).filter((id: any) => id != null))) as number[]
    const judgeById = new Map<number, string>()
    if (judgeIds.length > 0) {
      const judges = await db.selectFrom('judges')
        .select(['id', 'name'])
        .where('id', 'in', judgeIds as any)
        .execute() as Array<{ id: number, name: string }>
      for (const j of judges) judgeById.set(Number(j.id), j.name)
    }

    const claims = rows.map(r => ({
      ...r,
      claimed_judge: r.claimed_judge_id != null
        ? { id: r.claimed_judge_id, name: judgeById.get(Number(r.claimed_judge_id)) ?? '(unknown judge)' }
        : null,
    }))

    return response.json({ claims })
  },
})
