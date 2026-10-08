#!/usr/bin/env bun
/**
 * Remove the create-table migrations for the scaffold tables bench dropped.
 *
 * ## What drifted
 *
 * `1791300865144-drop-unused-scaffold-tables.sql` dropped 33 tables that came
 * from the project template and that bench never used — authors, carts,
 * coupons, orders, products, shipping_*, and so on. Their original
 * create-table migrations were left in place, which leaves the ledger
 * reporting 33 entries "recorded as applied, but the effects are gone from
 * the schema". `./buddy migrate:status --reconcile` deliberately will not
 * touch those: it repairs renumbered rows and records migrations the schema
 * proves, and it refuses to guess about an entry whose effects are missing.
 *
 * Leaving them is not harmless. The files still sit in database/migrations/,
 * so a database built from scratch — `migrate:fresh`, CI, a new machine —
 * has an empty ledger, runs all 33, and resurrects every scaffold table the
 * cleanup removed.
 *
 * ## What this does
 *
 * Deletes the 33 files and their 33 ledger rows. The mapping is derived from
 * the DROP statements in the drop migration itself rather than hardcoded, and
 * the script refuses to delete a file that git tracks — the two tracked files
 * with the same timestamp prefix (judge_responses, moderation_logs) are real
 * bench tables and must survive.
 *
 * Usage: `bun scripts/drop-scaffold-migrations.ts [--apply]` (dry run without)
 */

import { Database } from 'bun:sqlite'
import { execSync } from 'node:child_process'
import { readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const DB_PATH = process.env.DB_DATABASE || 'database/stacks.sqlite'
const DROP_MIGRATION = 'database/migrations/1791300865144-drop-unused-scaffold-tables.sql'
const MIGRATIONS = 'database/migrations'
const apply = process.argv.includes('--apply')

const dropSql = await Bun.file(DROP_MIGRATION).text()
const dropped = [...dropSql.matchAll(/DROP TABLE IF EXISTS "([a-z_]+)"/g)].map(m => m[1])
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
const tracked = new Set(
  execSync(`git ls-files ${MIGRATIONS}/`).toString().trim().split('\n').map(p => p.split('/').pop()!),
)

const db = apply ? new Database(DB_PATH) : new Database(DB_PATH, { readonly: true })
const recorded = new Set(db.query<{ migration: string }, []>('SELECT migration FROM migrations').all().map(r => r.migration))

const targets: string[] = []
for (const table of dropped) {
  const file = files.find(f => f.endsWith(`-create-${table}-table.sql`))
  if (!file) continue
  if (tracked.has(file)) {
    console.log(`  keep   ${file} — git tracks this one, leaving it alone`)
    continue
  }
  targets.push(file)
}

console.log(`\n  ${dropped.length} dropped tables, ${targets.length} untracked create-table migrations to remove`)
console.log(`  ${targets.filter(f => recorded.has(f)).length} of them are recorded in the ledger\n`)

if (!apply) {
  for (const f of targets) console.log(`    ${f}`)
  console.log('\n  dry run — re-run with --apply\n')
  process.exit(0)
}

let removedFiles = 0
let removedRows = 0
for (const f of targets) {
  unlinkSync(join(MIGRATIONS, f))
  removedFiles++
  if (recorded.has(f)) {
    db.run('DELETE FROM migrations WHERE migration = ?', [f])
    removedRows++
  }
}

const left = db.query<{ n: number }, []>('SELECT count(*) AS n FROM migrations').get()!.n
console.log(`  deleted ${removedFiles} files and ${removedRows} ledger rows`)
console.log(`  ledger now holds ${left} entries, ${readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).length} files on disk\n`)
