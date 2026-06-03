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
      ])
      .where('credential_claimed_at', 'is not', null)
      .where('credential_verified_at', 'is', null)
      .orderBy('credential_claimed_at', 'asc')
      .execute()

    return response.json({ claims: rows })
  },
})
