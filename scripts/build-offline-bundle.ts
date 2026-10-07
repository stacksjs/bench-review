#!/usr/bin/env bun
/**
 * Build the lean offline bundle the native app ships with.
 *
 * ## Why this exists
 *
 * `config/mobile.ts` gives the iOS app an offline copy of the site, so that a
 * deploy, a dropped connection or a dev-server restart shows the app's own
 * pages instead of a browser error. Pointing that at `dist/` directly produces
 * a **443 MB** payload, because `dist/` holds a pre-rendered page for every
 * entity:
 *
 *     judges/        290 MB   2747 pages
 *     court-houses/  143 MB    808 pages
 *     everything else ~10 MB    38 pages
 *
 * 121 KB average x 3593 pages. An app that size will not pass an App Store
 * cellular download limit, and `simctl install` times out before it even
 * finishes copying to a simulator.
 *
 * ## Why dropping the entity pages costs nothing
 *
 * Offline, the API is unreachable too, and bench renders entity content on the
 * client from API data — `judgesStore` fetches `/api/judges`, the courthouse
 * views fetch their own rows. So a bundled `judges/1803.html` offline shows the
 * chrome and an empty state, which is exactly what the shared tab shell at
 * `judges/_shell/*.html` already shows. The 2740 per-judge files add 433 MB and
 * no offline behaviour.
 *
 * What stays: every static page, the entity INDEX pages (`judges.html`,
 * `court-houses.html`), the shared judge tab shells, the blog, and every asset
 * directory. What goes: the per-id page trees.
 *
 * Run after `bun run build`, before `./buddy build:ios` — `bun run build:ios`
 * chains all three.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const SOURCE = 'dist'
const TARGET = 'dist-offline'

/** `judges/1803.html`, `court-houses/42.html` — a pre-rendered single entity. */
const ID_PAGE = /^\d+\.html$/
/** `court-houses/42/` — a per-entity directory of tab pages. */
const ID_DIR = /^\d+$/

/** Directories whose numeric children are per-entity pages rather than content. */
const ENTITY_TREES = new Set(['judges', 'court-houses', 'article', 'review', 'user'])

function dirSize(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size
  }
  return total
}

function countHtml(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      n += countHtml(full)
    else if (entry.name.endsWith('.html')) n++
  }
  return n
}

/**
 * Copy `from` into `to`, skipping per-entity pages inside an entity tree.
 *
 * `insideEntityTree` is only true one level down (directly inside `judges/`,
 * `court-houses/`, …) so a numeric directory deeper in the tree — or a file
 * that merely happens to be named with digits elsewhere — is still copied.
 */
function copyFiltered(from: string, to: string, insideEntityTree = false): void {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const name = entry.name
    if (insideEntityTree && (entry.isDirectory() ? ID_DIR.test(name) : ID_PAGE.test(name)))
      continue

    const src = join(from, name)
    const dest = join(to, name)
    if (entry.isDirectory())
      copyFiltered(src, dest, ENTITY_TREES.has(name))
    else cpSync(src, dest)
  }
}

if (!existsSync(SOURCE)) {
  console.error(`error: ${SOURCE}/ not found — run \`bun run build\` first`)
  process.exit(1)
}

const beforeBytes = dirSize(SOURCE)
const beforePages = countHtml(SOURCE)

rmSync(TARGET, { recursive: true, force: true })
copyFiltered(SOURCE, TARGET, false)

const afterBytes = dirSize(TARGET)
const afterPages = countHtml(TARGET)
const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`

console.log(`\n  offline bundle — ${SOURCE}/ -> ${TARGET}/\n`)
console.log(`  size    ${mb(beforeBytes)} -> ${mb(afterBytes)}  (${((1 - afterBytes / beforeBytes) * 100).toFixed(1)}% smaller)`)
console.log(`  pages   ${beforePages} -> ${afterPages}  (${beforePages - afterPages} per-entity pages dropped)\n`)

// A bundle that still carries hundreds of megabytes means the filter missed a
// tree — fail loudly rather than hand the iOS build an unshippable payload.
const LIMIT_BYTES = 80 * 1024 * 1024
if (afterBytes > LIMIT_BYTES) {
  console.error(`error: offline bundle is ${mb(afterBytes)}, over the ${mb(LIMIT_BYTES)} ceiling.`)
  console.error('       a new per-entity route is probably missing from ENTITY_TREES.')
  process.exit(1)
}
