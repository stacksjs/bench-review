import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A scratch database for the test suite, built from the committed migrations.
 *
 * Tests must never touch `database/stacks.sqlite`. That file is the
 * developer's working copy — it holds the 2,740-judge CourtListener import —
 * and a suite that writes to it would destroy real local state and make its
 * own results depend on whatever happened to be in there.
 *
 * `DB_DATABASE` IS honoured under `bun test` (the preload configures the db
 * layer before any test file imports it), so pointing it at this file is
 * enough to redirect everything — the ORM, the actions, the helpers.
 *
 * The schema comes from `database/migrations/*.sql` rather than a hand-rolled
 * fixture, so a test cannot pass against a table shape production does not
 * have. All 94 apply cleanly to a fresh SQLite file; that they do is itself
 * asserted in tests/unit/migrations.test.ts.
 */
export const TEST_DB_PATH = 'database/stacks_testing.sqlite'

/** Rebuild the scratch database from scratch. Returns the path. */
export function buildTestDatabase(path: string = TEST_DB_PATH): string {
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(`${path}${suffix}`, { force: true })

  const db = new Database(path)
  try {
    // Foreign keys OFF while building: the migrations create tables in
    // filename order, not dependency order, and a child table may land before
    // its parent. bun-query-builder turns them back on per connection at
    // runtime, which is what the app actually sees.
    db.run('PRAGMA foreign_keys = OFF')
    for (const file of migrationFiles())
      db.run(readFileSync(join('database/migrations', file), 'utf8'))
  }
  finally {
    db.close()
  }
  return path
}

/** Committed migrations in the order the runner applies them. */
export function migrationFiles(): string[] {
  return readdirSync('database/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort()
}

/**
 * Open the scratch database directly, for seeding fixtures and asserting
 * final state. Deliberately raw SQL rather than the ORM: a test should be
 * able to describe the rows it wants without going through the layer it is
 * testing.
 */
export function openTestDatabase(path: string = TEST_DB_PATH): Database {
  const db = new Database(path)
  db.run('PRAGMA foreign_keys = ON')
  return db
}
