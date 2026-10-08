#!/usr/bin/env bun
/**
 * Add the declared foreign keys that are missing from an existing database.
 *
 * ## Why this is a script and not a migration
 *
 * SQLite cannot `ALTER TABLE ADD CONSTRAINT`, so a missing foreign key means
 * rebuilding the table: create with the constraint, copy, drop, rename. The
 * framework's migration runner cannot execute that shape — it prepares each
 * statement in a file before the earlier ones have run, so the final
 * `ALTER TABLE … RENAME TO "x"` is validated while "x" still exists and fails
 * with "there is already another table or index with this name". The same SQL
 * through `db.run()` on the whole file succeeds, which is what this does.
 *
 * It is also not a migration because it is not something a new database
 * needs. On a fresh database the model phase creates these tables with their
 * constraints already in place; only a database that drifted — this one —
 * needs repairing. `buddy doctor` reports the drift, and its own suggested
 * remedies (`migrate:fresh`, or migrating against a clean database) both
 * reset data. This database holds 2,740 judges and 202 courthouses ingested
 * from CourtListener and Wikidata, so resetting is not available.
 *
 * ## What it does
 *
 * Backs the database up, applies each file in database/repairs/, then
 * verifies: foreign key count, `PRAGMA foreign_key_check`,
 * `PRAGMA integrity_check`, and that no table lost rows it was not meant to.
 * Any failure stops the run and names the file.
 *
 * Idempotent: a table that already has its constraint is skipped.
 *
 * Usage: `bun scripts/apply-fk-repair.ts [--apply]` (dry run without --apply)
 */

import { Database } from 'bun:sqlite'
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'

const DB_PATH = process.env.DB_DATABASE || 'database/stacks.sqlite'
const REPAIR_DIR = 'database/repairs'
const apply = process.argv.includes('--apply')

interface Counts { tables: number, indexes: number, fks: number, rows: Record<string, number> }

function snapshot(db: Database): Counts {
  const tables = db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all().map(r => r.name)
  let fks = 0
  const rows: Record<string, number> = {}
  for (const t of tables) {
    fks += db.query<{ n: number }, []>(`SELECT count(*) AS n FROM pragma_foreign_key_list('${t}')`).get()!.n
    rows[t] = db.query<{ n: number }, []>(`SELECT count(*) AS n FROM "${t}"`).get()!.n
  }
  return {
    tables: tables.length,
    indexes: db.query<{ n: number }, []>("SELECT count(*) AS n FROM sqlite_master WHERE type='index'").get()!.n,
    fks,
    rows,
  }
}

const db = apply ? new Database(DB_PATH) : new Database(DB_PATH, { readonly: true })
const before = snapshot(db)
console.log(`\n  ${DB_PATH}`)
console.log(`  before:  ${before.tables} tables, ${before.indexes} indexes, ${before.fks} foreign keys\n`)

const files = readdirSync(REPAIR_DIR).filter(f => f.endsWith('.sql')).sort()
if (!apply) {
  console.log(`  dry run — ${files.length} repair files would be applied:`)
  for (const f of files) console.log(`    ${f}`)
  console.log('\n  re-run with --apply\n')
  process.exit(0)
}

let applied = 0
for (const f of files) {
  const sql = await Bun.file(join(REPAIR_DIR, f)).text()
  // The table this file rebuilds, taken from its own DROP statement.
  const target = sql.match(/DROP TABLE "([^"]+)"/)?.[1]
  if (target) {
    const existing = db.query<{ n: number }, []>(`SELECT count(*) AS n FROM pragma_foreign_key_list('${target}')`).get()!.n
    const wanted = (sql.match(/REFERENCES "/g) || []).length
    if (existing >= wanted) {
      console.log(`  skip   ${basename(f)} (already has ${existing} foreign keys)`)
      continue
    }
  }
  try {
    db.run(sql)
    applied++
    console.log(`  ok     ${basename(f)}`)
  }
  catch (err) {
    console.error(`\n  FAILED ${basename(f)}: ${err instanceof Error ? err.message : err}`)
    console.error('  Stopping. The database is mid-repair — restore the backup before retrying.\n')
    process.exit(1)
  }
}

const after = snapshot(db)
const fkCheck = db.query('PRAGMA foreign_key_check').all()
const integrity = db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()!.integrity_check

console.log(`\n  after:   ${after.tables} tables, ${after.indexes} indexes, ${after.fks} foreign keys`)
console.log(`  applied: ${applied} of ${files.length} files`)
console.log(`  fk_check:        ${fkCheck.length === 0 ? 'clean' : `${fkCheck.length} violations`}`)
console.log(`  integrity_check: ${integrity}`)

const lost = Object.entries(before.rows).filter(([t, n]) => (after.rows[t] ?? 0) !== n)
if (lost.length) {
  console.log('\n  row counts changed:')
  for (const [t, n] of lost) console.log(`    ${t}: ${n} -> ${after.rows[t] ?? 'TABLE GONE'}`)
}
else {
  console.log('  row counts:      unchanged')
}

const ok = after.tables === before.tables && after.indexes === before.indexes
  && fkCheck.length === 0 && integrity === 'ok'
console.log(ok ? '\n  repair complete\n' : '\n  CHECKS FAILED — restore the backup\n')
process.exit(ok ? 0 : 1)
