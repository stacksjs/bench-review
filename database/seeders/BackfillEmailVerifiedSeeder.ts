import { db, Seeder } from '@stacksjs/database'

/**
 * One-time backfill: mark every PRE-EXISTING user as email-verified.
 *
 * Email verification (SubmitReviewAction's gate) only makes sense for
 * NEW signups. Accounts that already exist when verification ships
 * (seed/test users, early adopters) never received a verification email,
 * so this stamps them verified — otherwise they'd be locked out of
 * posting reviews through no fault of their own.
 *
 * Idempotent: only touches rows where `email_verified_at IS NULL`, so
 * re-running it (or running it after real verified users exist) leaves
 * already-verified accounts alone. Run once, after `./buddy migrate`
 * adds the `email_verified_at` column.
 */
export default class BackfillEmailVerifiedSeeder extends Seeder {
  async run(): Promise<void> {
    const now = new Date().toISOString()
    await db
      .updateTable('users')
      .set({ email_verified_at: now })
      .where('email_verified_at', 'is', null)
      .execute()
    console.log('[BackfillEmailVerifiedSeeder] Marked all pre-launch accounts as email-verified.')
  }
}
