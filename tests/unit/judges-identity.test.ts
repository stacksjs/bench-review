import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { migrationFiles } from '../helpers/database'

/**
 * Judge identity columns — bench-review#50.
 *
 * Profile records about named, sitting judges are first-party data, so being
 * unable to tell two same-name judges apart is an accuracy problem before it
 * is a product one. The widening migration also BACKFILLS, and a backfill is
 * the kind of thing that works on the author's machine and quietly mangles
 * 2,740 rows somewhere else.
 *
 * These run the real migrations against a fresh database, seed the shapes
 * that actually occur in the data (initials, suffixes, apostrophes, and the
 * same name twice), and assert what comes out.
 */

function freshSchema(): Database {
  const db = new Database(':memory:')
  db.run('PRAGMA foreign_keys = OFF')
  for (const file of migrationFiles())
    db.run(readFileSync(join('database/migrations', file), 'utf8'))
  return db
}

/** Apply only the migrations up to (not including) the widening one. */
function schemaBeforeWidening(): Database {
  const db = new Database(':memory:')
  db.run('PRAGMA foreign_keys = OFF')
  for (const file of migrationFiles()) {
    if (file.includes('widen-judges-identity'))
      break
    db.run(readFileSync(join('database/migrations', file), 'utf8'))
  }
  return db
}

function applyWidening(db: Database): void {
  const file = migrationFiles().find(f => f.includes('widen-judges-identity'))!
  db.run(readFileSync(join('database/migrations', file), 'utf8'))
}

describe('judges identity columns', () => {
  test('the columns exist with the documented defaults', () => {
    const db = freshSchema()
    const cols = new Map((db.query('PRAGMA table_info(judges)').all() as Array<any>).map(c => [c.name, c]))
    for (const col of ['jurisdiction', 'state', 'status', 'external_id', 'bio', 'appointed_year', 'slug'])
      expect(cols.has(col)).toBe(true)
    // status is the one that must not be nullable: a judge with no lifecycle
    // state is a judge the directory cannot describe honestly.
    expect(cols.get('status').notnull).toBe(1)
    db.close()
  })

  test('the backfill slugs real name shapes', () => {
    const db = schemaBeforeWidening()
    db.run('INSERT INTO court_houses (id, name, state) VALUES (1, \'District Court\', \'OR\')')
    for (const [id, name] of [
      [1, 'Ann L. Aiken'],
      [2, 'Samuel A. Alito Jr.'],
      [3, 'Maureen O\'Brien'],
      [4, 'Lee  Hastings, III'],
    ] as Array<[number, string]>)
      db.run('INSERT INTO judges (id, name, court_house_id) VALUES (?, ?, 1)', [id, name])

    applyWidening(db)

    const slugs = (db.query('SELECT id, slug FROM judges ORDER BY id').all() as Array<any>).map(r => r.slug)
    expect(slugs).toEqual(['ann-l-aiken', 'samuel-a-alito-jr', 'maureen-obrien', 'lee-hastings-iii'])
    // No empty, doubled or dangling separators — the shapes that make a URL
    // look broken and a unique index collide for the wrong reason.
    for (const s of slugs) {
      expect(s).not.toContain('--')
      expect(s.startsWith('-') || s.endsWith('-')).toBe(false)
    }
    db.close()
  })

  test('same-name judges get distinct slugs, and the first keeps the clean one', () => {
    const db = schemaBeforeWidening()
    db.run('INSERT INTO court_houses (id, name, state) VALUES (1, \'E.D. Missouri\', \'MO\'), (2, \'W.D. Missouri\', \'MO\')')
    db.run('INSERT INTO judges (id, name, court_house_id) VALUES (7, \'Brian Curtis Wimes\', 1), (9, \'Brian Curtis Wimes\', 2)')

    applyWidening(db)

    const rows = db.query('SELECT id, slug FROM judges ORDER BY id').all() as Array<any>
    // This is not hypothetical: one judge sitting in two districts is exactly
    // the case in the live data, and it is what the merge tooling is for.
    expect(rows[0].slug).toBe('brian-curtis-wimes')
    expect(rows[1].slug).toBe('brian-curtis-wimes-9')
    expect(rows[0].slug).not.toBe(rows[1].slug)
    db.close()
  })

  test('the unique index refuses a duplicate slug afterwards', () => {
    const db = freshSchema()
    db.run('INSERT INTO court_houses (id, name) VALUES (1, \'Court\')')
    db.run('INSERT INTO judges (name, court_house_id, slug) VALUES (\'A\', 1, \'taken\')')
    expect(() => db.run('INSERT INTO judges (name, court_house_id, slug) VALUES (\'B\', 1, \'taken\')')).toThrow()
    // Partial index: any number of rows may have no slug yet.
    db.run('INSERT INTO judges (name, court_house_id, slug) VALUES (\'C\', 1, NULL)')
    db.run('INSERT INTO judges (name, court_house_id, slug) VALUES (\'D\', 1, NULL)')
    db.close()
  })

  test('state is copied from the courthouse, and a courthouse without one is left NULL', () => {
    const db = schemaBeforeWidening()
    db.run('INSERT INTO court_houses (id, name, state) VALUES (1, \'With State\', \'PA\'), (2, \'No State\', NULL)')
    db.run('INSERT INTO judges (id, name, court_house_id) VALUES (1, \'A\', 1), (2, \'B\', 2)')

    applyWidening(db)

    const rows = db.query('SELECT id, state, status FROM judges ORDER BY id').all() as Array<any>
    expect(rows[0].state).toBe('PA')
    // Not '' or 'unknown' — absent data stays absent rather than being
    // invented, which is the same rule jurisdiction follows.
    expect(rows[1].state).toBeNull()
    expect(rows.every(r => r.status === 'active')).toBe(true)
    db.close()
  })

  test('jurisdiction is NOT guessed by the backfill', () => {
    const db = schemaBeforeWidening()
    db.run('INSERT INTO court_houses (id, name, state) VALUES (1, \'Superior Court of California\', \'CA\')')
    db.run('INSERT INTO judges (id, name, court_house_id) VALUES (1, \'A Seeded State Judge\', 1)')

    applyWidening(db)

    // Every ingested judge is federal, so a blanket 'federal' would have been
    // convenient and would have put a false jurisdiction on the hand-seeded
    // state-court judges. The ingest script sets it where it is a fact.
    expect((db.query('SELECT jurisdiction FROM judges WHERE id = 1').get() as any).jurisdiction).toBeNull()
    db.close()
  })
})
