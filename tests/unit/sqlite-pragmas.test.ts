import { db } from '@stacksjs/database'
import { describe, expect, test } from 'bun:test'

/**
 * SQLite pragmas on the connection the app actually uses — bench-review#52.
 *
 * The issue asks for an app-owned `configureSqlitePragmas()` at API boot.
 * Measured, all three are already set: bun-query-builder applies
 * `foreign_keys` and `busy_timeout` per connection, and `journal_mode=WAL`
 * is a property of the database FILE rather than the session, so it persists
 * once set. Adding our own call would duplicate the db layer.
 *
 * What was missing is this test. Every one of these is invisible when it
 * regresses:
 *
 *   foreign_keys  — SQLite defaults it OFF per connection. The FK repair
 *                   scripts in database/repairs/ added real constraints to 14
 *                   tables; with the pragma off they are decorative, orphans
 *                   accumulate silently, and no ON DELETE ever fires.
 *   busy_timeout  — at 0 a concurrent writer gets SQLITE_BUSY immediately
 *                   instead of waiting, surfacing as random 500s under load
 *                   rather than as anything reproducible.
 *   journal_mode  — without WAL, readers block writers.
 *
 * So this pins the db layer's behaviour rather than our own: if a future
 * bun-query-builder stops setting them, this is what says so.
 */

async function pragma(name: string): Promise<Record<string, any>> {
  const rows = await db.unsafe(`PRAGMA ${name}`) as Array<Record<string, any>>
  return rows?.[0] ?? {}
}

describe('sqlite pragmas', () => {
  test('foreign keys are enforced on the app connection', async () => {
    expect((await pragma('foreign_keys')).foreign_keys).toBe(1)
  })

  test('a busy writer waits instead of failing immediately', async () => {
    const value = Number(Object.values(await pragma('busy_timeout'))[0])
    expect(value).toBeGreaterThan(0)
  })

  test('the database is in WAL mode', async () => {
    expect(String((await pragma('journal_mode')).journal_mode).toLowerCase()).toBe('wal')
  })
})
