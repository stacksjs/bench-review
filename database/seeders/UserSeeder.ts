import { assignRole, seedDefaultRoles } from '@stacksjs/auth'
import { db, Seeder } from '@stacksjs/database'
import { makeHash } from '@stacksjs/security'
import { bootRbac } from '../../app/Helpers/rbac'

/**
 * Static user seed. Replaces the prior `useSeeder: { count: 10 }` on
 * the User model — the factory pipeline minted 10 unguessable-password
 * faker users on every migrate, polluting the admin user list and
 * making "real users" hard to spot.
 *
 * This seeder defines an explicit roster:
 *
 *   - `gtorregosa@gmail.com` (project owner) → admin role, kept whatever
 *     password the row was registered with (no overwrite).
 *   - `alice@example.com` / `bob@example.com` / `carol@example.com` →
 *     regular users created on demand with a documented test password,
 *     so a fresh checkout has someone to sign in as without going
 *     through the `/register` flow first.
 *
 * Idempotent: each row is keyed by email; existing rows are left
 * untouched. Run safely as part of CI, post-deploy, or alongside any
 * other seeder.
 *
 * Test password is committed in plaintext on purpose. These are
 * fixture accounts, not production credentials — the value lives in
 * git history regardless, and surfacing it here is clearer than
 * burying it in a `.env.example` half the team forgets to read.
 */
const TEST_PASSWORD = 'password123'

interface SeededUser {
  email: string
  name: string
  role?: 'admin' | 'dev' | 'client'
}

const USERS: SeededUser[] = [
  // Admin — the project owner. Already has a registered account, so
  // the seeder only assigns the role; it never touches password/name.
  { email: 'gtorregosa@gmail.com', name: 'Glenn Michael Torregosa', role: 'admin' },

  // Regular test users — useful for exercising review submission,
  // follows, likes from a non-admin perspective.
  { email: 'alice@example.com', name: 'Alice Roberts' },
  { email: 'bob@example.com', name: 'Bob Sanchez' },
  { email: 'carol@example.com', name: 'Carol Nakamura' },
]

export default class UserSeeder extends Seeder {
  async run(): Promise<void> {
    bootRbac()

    // Defensive: ensure the role packs exist before we try to assign
    // 'admin'. RoleSeeder normally does this, but seeder ordering is
    // alphabetic and UserSeeder may run first (U > R alphabetically,
    // so RoleSeeder actually runs first — but the defensive call is
    // cheap insurance against future renames).
    await seedDefaultRoles()

    const passwordHash = await makeHash(TEST_PASSWORD, { algorithm: 'bcrypt' })

    for (const u of USERS) {
      const existing = await db.selectFrom('users' as any)
        .select(['id'] as any)
        .where('email' as any, '=', u.email)
        .executeTakeFirst() as { id: number } | undefined

      let userId: number
      if (existing) {
        userId = existing.id
        console.log(`[UserSeeder] ${u.email} already exists (id=${userId})`)
      }
      else {
        const now = new Date().toISOString()
        await db.insertInto('users' as any).values({
          email: u.email,
          name: u.name,
          password: passwordHash,
          uuid: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
        } as any).execute()

        const inserted = await db.selectFrom('users' as any)
          .select(['id'] as any)
          .where('email' as any, '=', u.email)
          .executeTakeFirst() as { id: number }
        userId = inserted.id
        console.log(`[UserSeeder] created ${u.email} (id=${userId}, password=${TEST_PASSWORD})`)
      }

      if (u.role) {
        await assignRole(userId, u.role)
        console.log(`[UserSeeder] ${u.email} → ${u.role}`)
      }
    }
  }
}

// Self-invocation when run directly: `bun database/seeders/UserSeeder.ts`.
// Skipped when the file is imported by `./buddy seed`, which constructs
// and runs the seeder class itself. `import.meta.main` is Bun's
// idiomatic "this is the entry point" check — true only when the file
// is the actual process target.
if (import.meta.main) {
  await new UserSeeder().run()
}

