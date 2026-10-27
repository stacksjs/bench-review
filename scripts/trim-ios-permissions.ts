/**
 * Remove the permissions bench does not use from the generated Info.plist.
 *
 * ## Why this has to exist
 *
 * Craft writes ELEVEN NS*UsageDescription keys into every iOS project it
 * generates, whatever the app declares. The generator keeps a LINKED_PURPOSES
 * table of those eleven, maps over all of them, and for any that is not
 * enabled falls back to a placeholder instead of omitting it:
 *
 *     return linked ? [key, appName + ' asks for ' + linked
 *                           + ' only in a feature that needs it.'] : null
 *
 * Only a key missing from that table produces null, so all eleven always
 * survive the filter. bench declares five capabilities — camera, filePicker,
 * share, deepLinks, secureStorage — and still shipped usage strings for
 * speech recognition, Apple Music, Bluetooth, motion, contacts, calendars,
 * location, the microphone and Face ID.
 *
 * That matters beyond tidiness. Declaring permissions an app does not use,
 * with non-specific purpose strings, is a documented App Review rejection
 * reason, and those placeholder sentences say nothing about why the app wants
 * anything. It is also a privacy claim we do not mean: the strings are what
 * iOS shows a person at the prompt.
 *
 * ## Why it is a patch and not configuration
 *
 * Craft DOES support `usageDescriptions`, but it only replaces a key's text —
 * there is no option that removes one. And it never reaches Craft anyway:
 * @stacksjs/actions/dist/build/ios.js forwards bundleId, capabilities, name
 * and teamId, and contains no occurrence of `usageDescriptions`. Setting it in
 * config/mobile.ts would be silently dropped, which is the same forwarding gap
 * that once swallowed `renderer` and `nativeScreens`.
 *
 * ## Why it survives Xcode Cloud, unlike the tab-bar patch
 *
 * scripts/patch-ios-tabbar.ts rewrites Swift, and Xcode Cloud regenerates the
 * Swift after checkout via restoreIosShell -> restoreShell, so that patch is
 * lost there. restoreShell writes only Sources/*.swift; it never touches
 * Info.plist. The committed Info.plist is what Apple builds with, so this
 * patch does survive — which is exactly why it is safe to rely on it.
 *
 * Idempotent: running it on an already-trimmed plist changes nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

/** The eleven keys Craft's LINKED_PURPOSES table forces into every build. */
export const CRAFT_FORCED_KEYS = [
  'NSSpeechRecognitionUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSContactsUsageDescription',
  'NSCalendarsUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSMotionUsageDescription',
  'NSFaceIDUsageDescription',
  'NSAppleMusicUsageDescription',
] as const

/**
 * What bench keeps, and what iOS should actually say at the prompt.
 *
 * These two correspond to the `camera` and `filePicker` capabilities in
 * config/mobile.ts. Everything else in the list above is dropped: the native
 * screens use craft.app, craft.navigation, craft.route, craft.secureStorage
 * and craft.snapshots, and config/mobile.ts already records that geolocation,
 * biometric and push are "NOT declared, deliberately" — so there is no Face ID
 * prompt to explain either.
 */
export const KEPT: Record<string, string> = {
  NSCameraUsageDescription:
    'Bench Review uses the camera so you can attach a photo to a review you are writing.',
  NSPhotoLibraryUsageDescription:
    'Bench Review opens your photo library so you can attach an existing photo to a review.',
}

/** Rewrites one plist's usage descriptions. Returns what changed. */
export function trimUsageDescriptions(plist: string): {
  source: string
  removed: string[]
  rewritten: string[]
} {
  const removed: string[] = []
  const rewritten: string[] = []
  let source = plist

  for (const key of CRAFT_FORCED_KEYS) {
    // The generated plist is flat: a key line, then its string on the next.
    const pair = new RegExp(
      `[ \\t]*<key>${key}</key>\\s*\\n[ \\t]*<string>([\\s\\S]*?)</string>[ \\t]*\\n`,
      'g',
    )
    const replacement = KEPT[key]
    if (replacement) {
      const before = source
      source = source.replace(pair, (match, current: string) => {
        if (current === replacement)
          return match
        rewritten.push(key)
        return match.replace(`<string>${current}</string>`, `<string>${replacement}</string>`)
      })
      if (before !== source && !rewritten.includes(key))
        rewritten.push(key)
      continue
    }
    const before = source
    source = source.replace(pair, '')
    if (before !== source)
      removed.push(key)
  }

  return { source, removed, rewritten }
}

export function run(projectRoot: string): void {
  const plistPath = join(projectRoot, 'storage/framework/mobile/ios/Info.plist')
  let original: string
  try {
    original = readFileSync(plistPath, 'utf8')
  }
  catch {
    // Nothing generated yet. Not an error: the build step that creates it has
    // simply not run, and failing here would break a clean checkout.
    return
  }

  const { source, removed, rewritten } = trimUsageDescriptions(original)

  // A plist that still carries a key we meant to drop means the generator's
  // shape changed under us, and silence would hand Apple the old list again.
  for (const key of CRAFT_FORCED_KEYS) {
    if (!KEPT[key] && source.includes(key)) {
      console.error(`[ios-permissions] could not remove ${key} from Info.plist.`)
      console.error('[ios-permissions] Craft\'s plist shape has changed; update this script.')
      process.exit(1)
    }
  }

  if (source !== original)
    writeFileSync(plistPath, source)

  const kept = Object.keys(KEPT).length
  console.warn(
    `[ios-permissions] ${kept} permission(s) kept, ${removed.length} removed`
    + `${rewritten.length ? `, ${rewritten.length} reworded` : ''}`,
  )
}

if (import.meta.main)
  run(process.cwd())
