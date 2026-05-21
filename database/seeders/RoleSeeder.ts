import { Seeder } from '@stacksjs/database'
import { seedDefaultRoles } from '@stacksjs/auth'
import { bootRbac } from '../../app/Helpers/rbac'

/**
 * Seeds the three default role packs every Stacks dashboard
 * understands by name: `admin`, `dev`, `client`.
 *
 * Wraps the framework's `seedDefaultRoles()` (see
 * `storage/framework/core/auth/src/rbac-seed.ts`). The framework
 * helper is idempotent — re-running the seeder leaves existing
 * rows untouched and only INSERTs the missing ones, so this is
 * safe to call from CI, post-deploy hooks, or after a
 * `migrate:fresh`.
 *
 * Must run BEFORE any seeder that calls `assignRole(user, 'admin')`
 * — that includes our own `AdminUserSeeder`. Seeders run in
 * alphabetic order, so `RoleSeeder` (R < A? — no, A < R) actually
 * runs AFTER `AdminUserSeeder` by default. We rely on
 * `AdminUserSeeder.run()` calling `seedDefaultRoles()` first
 * defensively rather than depending on file ordering.
 */
export default class RoleSeeder extends Seeder {
  async run(): Promise<void> {
    bootRbac()
    const result = await seedDefaultRoles()
    if (result.created.length > 0)
      console.log(`[RoleSeeder] Created ${result.created.length} role(s): ${result.created.map(r => r.name).join(', ')}`)
    if (result.skipped.length > 0)
      console.log(`[RoleSeeder] Skipped ${result.skipped.length} existing role(s): ${result.skipped.map(s => s.name).join(', ')}`)
  }
}
