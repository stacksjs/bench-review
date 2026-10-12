import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { migrationFiles } from '../helpers/database'

/**
 * The committed migrations must be able to build the schema the app runs on,
 * from nothing.
 *
 * This was bench-review#47's hardest acceptance criterion and the one most
 * likely to rot silently: dev works because the live file already has the
 * tables, so a migration that never applies cleanly costs nothing until the
 * day a production database is provisioned from this directory.
 *
 * Also pins the two indexes that were named `_unique` without being unique —
 * one draft per user, one flag per reporter per review. Both were plain
 * indexes for months while a model comment claimed otherwise.
 */
function freshSchema(): Database {
  const db = new Database(':memory:')
  db.run('PRAGMA foreign_keys = OFF')
  for (const file of migrationFiles())
    db.run(readFileSync(join('database/migrations', file), 'utf8'))
  return db
}

describe('committed migrations', () => {
  test('every one applies to an empty database', () => {
    const files = migrationFiles()
    expect(files.length).toBeGreaterThan(0)

    const db = new Database(':memory:')
    db.run('PRAGMA foreign_keys = OFF')
    const failures: string[] = []
    for (const file of files) {
      try {
        db.run(readFileSync(join('database/migrations', file), 'utf8'))
      }
      catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    db.close()
    expect(failures).toEqual([])
  })

  test('produces the tables the app actually queries', () => {
    const db = freshSchema()
    const names = new Set((db.query('SELECT name FROM sqlite_master WHERE type = \'table\'').all() as Array<{ name: string }>).map(r => r.name))
    db.close()

    for (const table of [
      'users', 'judges', 'court_houses', 'judge_reviews', 'review_comments',
      'review_flags', 'review_drafts', 'judge_follows', 'judge_submissions',
      'subscribers', 'campaigns', 'moderation_logs', 'judge_search_queries',
    ])
      expect(names).toContain(table)
  })

  // Pinned because it is surprising and because something depends on it.
  //
  // `user_notifications`, `notification_preferences` and
  // `notification_deliveries` are created by the FRAMEWORK during
  // `buddy migrate` (migrateNotificationTables), not by anything in
  // database/migrations. They exist in the dev database and the app writes to
  // all three — every in-app notification, the publish fan-out, the comment
  // notifications, the email opt-outs.
  //
  // So a database provisioned by replaying only the committed .sql files is
  // INCOMPLETE, and the notification system would 500 against it. That is
  // fine as long as provisioning goes through `buddy migrate`; it is a trap
  // the moment someone reaches for the migrations directory alone. If a
  // future change starts creating these in-repo, this test should fail and be
  // deleted — that would be the improvement.
  test('notification tables come from the framework, not the committed migrations', () => {
    const db = freshSchema()
    const names = new Set((db.query('SELECT name FROM sqlite_master WHERE type = \'table\'').all() as Array<{ name: string }>).map(r => r.name))
    db.close()

    for (const frameworkOwned of ['user_notifications', 'notification_preferences', 'notification_deliveries'])
      expect(names).not.toContain(frameworkOwned)
  })

  test('one draft per user is a UNIQUE index, not just a name', () => {
    const db = freshSchema()
    db.run('INSERT INTO review_drafts (user_id, title) VALUES (1, \'first tab\')')
    // The second tab's autosave must be refused by the database, not merely
    // by the check-then-insert above it.
    expect(() => db.run('INSERT INTO review_drafts (user_id, title) VALUES (1, \'second tab\')')).toThrow()
    // A different user is unaffected.
    db.run('INSERT INTO review_drafts (user_id, title) VALUES (2, \'theirs\')')
    db.close()
  })

  test('one flag per reporter per review, but anonymous flags are unconstrained', () => {
    const db = freshSchema()
    db.run('INSERT INTO review_flags (judge_review_id, user_id, reason) VALUES (10, 5, \'spam\')')
    expect(() => db.run('INSERT INTO review_flags (judge_review_id, user_id, reason) VALUES (10, 5, \'again\')')).toThrow()

    // Partial index: anonymous reports carry a NULL user_id and must not
    // collapse into one row per review.
    db.run('INSERT INTO review_flags (judge_review_id, user_id, reason) VALUES (10, NULL, \'anon one\')')
    db.run('INSERT INTO review_flags (judge_review_id, user_id, reason) VALUES (10, NULL, \'anon two\')')
    const anon = db.query('SELECT COUNT(*) AS c FROM review_flags WHERE user_id IS NULL').get() as { c: number }
    expect(anon.c).toBe(2)

    // Same reporter, different review: fine.
    db.run('INSERT INTO review_flags (judge_review_id, user_id, reason) VALUES (11, 5, \'other\')')
    db.close()
  })

  test('a user cannot hold two live reviews of the same judge', () => {
    const db = freshSchema()
    db.run('INSERT INTO judge_reviews (judge_id, user_id, title, status) VALUES (1, 7, \'first\', \'published\')')
    expect(() => db.run('INSERT INTO judge_reviews (judge_id, user_id, title, status) VALUES (1, 7, \'second\', \'pending\')')).toThrow()
    // A rejected one does not count, so a declined reviewer can try again.
    db.run('UPDATE judge_reviews SET status = \'rejected\' WHERE user_id = 7')
    db.run('INSERT INTO judge_reviews (judge_id, user_id, title, status) VALUES (1, 7, \'resubmitted\', \'pending\')')
    db.close()
  })
})
