import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/me/credentials — user submits or updates their
 * self-declared credential claim (bench-review#37).
 *
 * The user is making a *claim* about their professional credential —
 * "I'm an attorney admitted to the California bar" or "I clerk at
 * the 9th Circuit". The claim is stored immediately but doesn't
 * become a verified badge until an admin approves it.
 *
 * Body:
 *   - credential_type     : 'bar_admission' / 'clerk_position' /
 *                           'court_staff' / 'judicial_appointment'
 *   - credential_state    : 2-letter state code or 'FEDERAL'
 *
 * Side effects:
 *   - sets `credential_claimed_at` to now()
 *   - CLEARS `credential_verified_at`, `credential_verified_by_user_id`,
 *     `credential_rejection_note` — a fresh claim resets the queue.
 *     Editing the credential type means the previous verification
 *     no longer applies; the admin needs to look again.
 *
 * Resolves bench-review#37 (claim half).
 */
const ALLOWED_TYPES = new Set([
  'bar_admission',
  'clerk_position',
  'court_staff',
  'judicial_appointment',
])

// Permissive — accept any 2-letter state code plus the literal
// "FEDERAL" sentinel. Bench-review covers federal + state courts
// so both are valid territories.
const STATE_PATTERN = /^[A-Z]{2}$|^FEDERAL$/

export default new Action({
  name: 'Update Credential Claim',
  description: 'Submit or update the user\'s self-declared credential claim',
  method: 'PATCH',

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const type = String((request as any).get?.('credential_type') ?? '').trim().toLowerCase()
    const stateRaw = String((request as any).get?.('credential_state') ?? '').trim().toUpperCase()

    if (!ALLOWED_TYPES.has(type))
      return response.json({ error: 'Pick one of: bar_admission, clerk_position, court_staff, judicial_appointment.' }, 422)

    if (!STATE_PATTERN.test(stateRaw))
      return response.json({ error: 'State must be a 2-letter code (e.g. CA, NY) or "FEDERAL".' }, 422)

    const now = new Date().toISOString()
    await db.updateTable('users')
      .set({
        credential_type: type,
        credential_state: stateRaw,
        credential_claimed_at: now,
        // Reset verification when the claim changes. The admin must
        // look at the new claim independently.
        credential_verified_at: null,
        credential_verified_by_user_id: null,
        credential_rejection_note: null,
        updated_at: now,
      } as any)
      .where('id', '=', Number(userId))
      .execute()

    return response.json({
      ok: true,
      claim: {
        credential_type: type,
        credential_state: stateRaw,
        credential_claimed_at: now,
        credential_verified_at: null,
        credential_rejection_note: null,
      },
    })
  },
})
