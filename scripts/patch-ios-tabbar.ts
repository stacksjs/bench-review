import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Square off the tab bar's selection highlight (craft-native/craft#386).
 *
 * Craft draws the selected tab's background as a hardcoded `Capsule()` and
 * offers no way to change it: a tab in `config/mobile.ts` is
 * `{ id, title, symbol, badge }` with no styling, and there are no tab-bar
 * appearance options. The shape is decided in GENERATED Swift under
 * `storage/framework/mobile/ios/`, which is gitignored and rewritten in full
 * by `./buddy build:ios`.
 *
 * So this runs as part of the build rather than being applied by hand. A
 * hand-patch to a generated tree is a trap: it survives until the next
 * regeneration and then reverts silently, which is the worst possible
 * failure — the thing you fixed comes back and nothing says so.
 *
 * ⚠️ SCOPE. Only the SELECTION HIGHLIGHT changes. The bar's own
 * `.background(.ultraThinMaterial, in: Capsule())` stays a capsule, because
 * that is the iOS 26 Liquid Glass tab bar shape and it is correct; so does
 * the red badge. Replacing every `Capsule()` in the file would square off the
 * whole bar.
 *
 * Retire this once #386 ships a real option — the assertion below will fail
 * the build if upstream changes this code, which is the signal to check.
 */

/** 6pt — crosswind's `rounded-md` (0.375rem), which is what was asked for. */
export const CORNER_RADIUS = 6

const SHAPE = `RoundedRectangle(cornerRadius: ${CORNER_RADIUS}, style: .continuous)`

/**
 * The highlight, matched by what makes it the HIGHLIGHT rather than by the
 * bare `Capsule()` it shares with the bar and the badge: the fill and the
 * `matchedGeometryEffect` that slides it between tabs.
 */
const HIGHLIGHT = /Capsule\(\)(\s*\n\s*)\.fill\(Color\.primary\.opacity\(0\.09\)\)(\s*\n\s*)\.matchedGeometryEffect\(id: "selection"/

/**
 * The tappable region, which has to follow the drawn shape or the corners
 * accept taps the highlight does not cover.
 */
const CONTENT_SHAPE = '.contentShape(Capsule())'

export interface PatchResult {
  source: string
  changed: boolean
}

/**
 * Square the highlight in one file's source.
 *
 * Idempotent: a file already carrying the rounded rectangle is left alone and
 * reported as unchanged, so running the build twice is not an error.
 *
 * Throws when the file holds a tab bar whose highlight no longer looks like
 * this. Failing the build is the point — silently skipping would let the
 * capsule come back with nothing to show for it.
 */
export function patchTabBarHighlight(source: string): PatchResult {
  const alreadyDone = source.includes(SHAPE)
  const hasHighlight = HIGHLIGHT.test(source)

  if (!hasHighlight) {
    if (alreadyDone)
      return { source, changed: false }
    throw new Error(
      'The tab bar selection highlight was not found in its expected shape. '
      + 'Craft has probably changed how it draws it — check craft-native/craft#386, '
      + 'and if it is fixed upstream delete scripts/patch-ios-tabbar.ts and its build step.',
    )
  }

  let next = source.replace(HIGHLIGHT, `${SHAPE}$1.fill(Color.primary.opacity(0.09))$2.matchedGeometryEffect(id: "selection"`)

  // The hit area follows the drawn shape. Only the one directly on the tab
  // button; there is exactly one in the generated file.
  if (next.includes(CONTENT_SHAPE))
    next = next.replace(CONTENT_SHAPE, `.contentShape(${SHAPE})`)

  return { source: next, changed: next !== source }
}

/** Every generated Swift source, so this does not hardcode the app's name. */
export function swiftSources(root: string): string[] {
  try {
    return readdirSync(root).filter(f => f.endsWith('.swift')).map(f => join(root, f))
  }
  catch {
    return []
  }
}

export function run(projectRoot: string): number {
  const sources = swiftSources(join(projectRoot, 'storage/framework/mobile/ios/Sources'))
  if (!sources.length) {
    console.log('  tab bar: no generated Swift yet — nothing to patch')
    return 0
  }

  let patched = 0
  for (const file of sources) {
    const before = readFileSync(file, 'utf8')
    // Only the file that actually draws the bar; the rest have no highlight
    // and must not be asserted against.
    if (!before.includes('matchedGeometryEffect(id: "selection"') && !before.includes(SHAPE))
      continue

    const result = patchTabBarHighlight(before)
    if (result.changed) {
      writeFileSync(file, result.source)
      patched++
    }
  }

  console.log(patched
    ? `  tab bar: selection highlight squared to ${CORNER_RADIUS}pt (craft#386)`
    : '  tab bar: selection highlight already squared')
  return patched
}

if (import.meta.main)
  run(process.cwd())
