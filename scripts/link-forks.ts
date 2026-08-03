#!/usr/bin/env bun
/**
 * link-forks — overlay bench's local framework forks on top of the published
 * node_modules install.
 *
 * bench depends on unpublished patches in three monorepo sub-packages. They
 * cannot be `file:`-linked from package.json (their package.json declare
 * `workspace:*` deps on siblings that bun can't resolve outside their own
 * workspace), so instead we install the published versions cleanly and then
 * symlink the fork over each one here. Runs as `postinstall`, so
 * `rm -rf node_modules && bun install` re-establishes the overlay automatically.
 *
 * Defensive by design: if a fork directory is missing (CI, a fresh clone, a
 * production image) the published package is left in place and we log a skip —
 * install never fails because of this script.
 *
 * See docs/framework-patches/FORKS.md for what each fork carries.
 */
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const HOME = process.env.HOME ?? ''
const ROOT = resolve(import.meta.dir, '..')
const NM = join(ROOT, 'node_modules')

interface Fork {
  pkg: string
  dir: string
  distProbe: string
}

// NOTE: the stx monorepo fork (~/Documents/Projects/stx: @stacksjs/stx,
// bun-plugin-stx, stx-router) is intentionally NOT overlaid. Its dist is stale
// vs published 0.2.152 (built from an older commit that predates
// bracketPathToRegex), so overlaying it dragged a broken stx-router into the
// whole @stacksjs/* graph. bench uses the PUBLISHED stx layer; any local stx
// patch that regresses is re-homed via `bun patch` instead. See
// docs/framework-patches/FORKS.md.
const FORKS: Fork[] = [
  { pkg: 'bun-query-builder', dir: `${HOME}/Documents/Projects/bun-query-builder/packages/bun-query-builder`, distProbe: 'dist/src/index.js' },
  { pkg: 'ts-medium-editor', dir: `${HOME}/Documents/Stacks/ts-medium-editor`, distProbe: 'dist/index.js' },
]

let linked = 0
let skipped = 0

for (const fork of FORKS) {
  if (!existsSync(fork.dir)) {
    console.warn(`[link-forks] skip ${fork.pkg} — fork not found at ${fork.dir} (keeping published)`)
    skipped++
    continue
  }
  if (!existsSync(join(fork.dir, fork.distProbe))) {
    console.warn(`[link-forks] WARN ${fork.pkg} — fork present but ${fork.distProbe} missing; build it (bun run build) or the overlay ships stale/empty`)
  }

  const target = join(NM, fork.pkg)

  mkdirSync(dirname(target), { recursive: true })
  // Idempotent: remove whatever is there (published dir, stale/broken symlink)
  // and re-point at the fork.
  if (existsSync(target) || isBrokenSymlink(target))
    rmSync(target, { recursive: true, force: true })
  symlinkSync(fork.dir, target, 'dir')
  console.info(`[link-forks] linked ${fork.pkg} -> ${fork.dir}`)
  linked++
}

function isBrokenSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink()
  }
  catch {
    return false
  }
}

console.info(`[link-forks] done — ${linked} linked, ${skipped} skipped`)
