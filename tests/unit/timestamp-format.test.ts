import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { migrationFiles } from '../helpers/database'

/**
 * One timestamp format — bench-review#52.
 *
 * SQLite column defaults are CURRENT_TIMESTAMP (`2026-10-13 12:00:00`); the
 * app's actions write `new Date().toISOString()`
 * (`2026-10-13T12:00:00.000Z`). Both land in the same TEXT column depending
 * on which path created the row, and these columns are compared as STRINGS.
 */

const NORMALIZER = migrationFiles().find(f => f.includes('normalize-timestamps-to-iso'))!

function schemaBeforeNormalizing(): Database {
  const db = new Database(':memory:')
  db.run('PRAGMA foreign_keys = OFF')
  for (const file of migrationFiles()) {
    if (file === NORMALIZER)
      break
    db.run(readFileSync(join('database/migrations', file), 'utf8'))
  }
  return db
}

function normalize(db: Database): void {
  db.run(readFileSync(join('database/migrations', NORMALIZER), 'utf8'))
}

describe('timestamp format', () => {
  test('string comparison is why this matters', () => {
    const db = new Database(':memory:')
    const [row] = db.query('SELECT \'2026-10-13 12:00:00\' < \'2026-10-13T11:00:00.000Z\' AS wrong').all() as Array<{ wrong: number }>
    // A row created at 12:00 sorts BEFORE one created at 11:00, because 'T'
    // is greater than ' '. Every ORDER BY created_at in the app interleaves
    // wrongly once a table holds both shapes.
    expect(row.wrong).toBe(1)
    db.close()
  })

  test('bare datetimes become ISO, and ordering is restored', () => {
    const db = schemaBeforeNormalizing()
    db.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'Later\', \'2026-10-13 12:00:00\')')
    db.run('INSERT INTO judges (id, name, created_at) VALUES (2, \'Earlier\', \'2026-10-13T11:00:00.000Z\')')

    const before = (db.query('SELECT name FROM judges ORDER BY created_at DESC').all() as Array<{ name: string }>).map(r => r.name)
    expect(before).toEqual(['Earlier', 'Later'])

    normalize(db)

    const after = (db.query('SELECT name FROM judges ORDER BY created_at DESC').all() as Array<{ name: string }>).map(r => r.name)
    expect(after).toEqual(['Later', 'Earlier'])
    db.close()
  })

  test('values already in ISO are left exactly as they were', () => {
    const db = schemaBeforeNormalizing()
    db.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A\', \'2026-10-13T11:00:00.000Z\')')
    normalize(db)
    expect((db.query('SELECT created_at FROM judges WHERE id = 1').get() as any).created_at).toBe('2026-10-13T11:00:00.000Z')
    db.close()
  })

  test('re-running it changes nothing', () => {
    const db = schemaBeforeNormalizing()
    db.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A\', \'2026-10-13 12:00:00\')')
    normalize(db)
    const once = (db.query('SELECT created_at FROM judges WHERE id = 1').get() as any).created_at
    normalize(db)
    // The WHERE clause matches the bare shape only, so a second pass is a
    // no-op rather than appending another 'Z'.
    expect((db.query('SELECT created_at FROM judges WHERE id = 1').get() as any).created_at).toBe(once)
    expect(once).toBe('2026-10-13T12:00:00Z')
    db.close()
  })

  test('a NULL updated_at is not turned into a string', () => {
    const db = schemaBeforeNormalizing()
    db.run('INSERT INTO judges (id, name, created_at, updated_at) VALUES (1, \'A\', \'2026-10-13 12:00:00\', NULL)')
    normalize(db)
    expect((db.query('SELECT updated_at FROM judges WHERE id = 1').get() as any).updated_at).toBeNull()
    db.close()
  })
})
