import { assignRole, seedDefaultRoles } from '@stacksjs/auth'
import { db, Seeder } from '@stacksjs/database'
import { bootRbac } from '../../app/Helpers/rbac'

/**
 * Promotes a configured email to the `admin` role. Idempotent:
 * `assignRoleToUser` (see rbac-store-bqb.ts:112-132) swallows the
 * duplicate-PK violation when the user already has the role.
 *
 * Configure via the `ADMIN_EMAIL` env var. Falls back to the project
 * owner's email so a fresh checkout boots a working admin without any
 * extra wiring.
 *
 * Re-seeds the role packs first — alphabetic seeder order would run
 * `AdminUserSeeder` before `RoleSeeder` and we'd get "Role 'admin' not
 * found" on the very first run. Calling `seedDefaultRoles()` ourselves
 * is cheap (idempotent) and removes the ordering footgun.
 */
const DEFAULT_ADMIN_EMAIL = 'gtorregosa@gmail.com'

export default class AdminUserSeeder extends Seeder {
  async run(): Promise<void> {
    bootRbac()
    await seedDefaultRoles()

    const email = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL

    const user = await db.selectFrom('users' as any)
      .select(['id', 'email', 'name'] as any)
      .where('email' as any, '=', email)
      .executeTakeFirst() as { id: number, email: string, name: string } | undefined

    if (!user) {
      console.warn(`[AdminUserSeeder] No user with email "${email}". Register at /register first, then re-run this seeder.`)
      return
    }

    await assignRole(user.id, 'admin')
    console.log(`[AdminUserSeeder] ${user.email} (id=${user.id}) now has the admin role.`)
  }
}
