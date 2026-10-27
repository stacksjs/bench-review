/**
 * Remove the permissions bench does not use from the generated Info.plist.
 *
 * ## Why this has to exist
 *
 * Craft writes ELEVEN NS*UsageDescription keys into every iOS project it
 * generates, whatever the app declares. Its renderUsageDescriptions() keeps a
 * LINKED_PURPOSES table and, for a capability that is NOT enabled, falls back
 * to a placeholder instead of omitting the key:
 *
 *     return linked ? [key, appName + ' asks for ' + linked
 *                           + ' only in a feature that needs it.'] : null
 *
 * The generator already does the right thing for the four permissions absent
 * from that table (Local Network, both HealthKit keys, Always-location): they
 * hit the null arm and are filtered out. The eleven IN the table never are.
 * Filed as craft-native/craft#424.
 *
 * bench declares five capabilities — camera, filePicker, share, deepLinks,
 * secureStorage — and still shipped usage strings for speech recognition,
 * Apple Music, Bluetooth, motion, contacts, calendars, location, the
 * microphone and Face ID.
 *
 * That matters beyond tidiness. Declaring permissions an app does not use,
 * with non-specific purpose strings, is a documented App Review rejection
 * reason, and those strings are what iOS shows a person at the prompt.
 *
 * ## What this does and does NOT do
 *
 * It only DELETES. The wording of the two permissions bench keeps lives in
 * config/mobile.ts under `usageDescriptions`, which is the supported option
 * and IS forwarded — @stacksjs/actions/dist/build/ios-config.ts maps it
 * through as `usageDescriptions: config.usageDescriptions`.
 *
 * (An earlier version of this comment claimed it was dropped by the Stacks
 * layer. That was wrong: it came from grepping build/ios.ts, which spreads
 * the whole config into toCraftIosConfig rather than naming keys, so the
 * absence of the string there proved nothing. The allowlist is in
 * build/ios-config.ts and does include it.)
 *
 * What Craft genuinely has no option for is REMOVING a key, which is why the
 * deletions below cannot be configuration.
 *
 * ## Why it survives Xcode Cloud, unlike the tab-bar patch
 *
 * scripts/patch-ios-tabbar.ts rewrites Swift, and Xcode Cloud regenerates the
 * Swift after checkout via restoreIosShell -> restoreShell, so that patch is
 * lost there. restoreShell writes only Sources/*.swift; it never touches
 * Info.plist. The committed Info.plist is what Apple builds with, so this
 * patch does survive.
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
 * The two bench keeps, matching the `camera` and `filePicker` capabilities in
 * config/mobile.ts. Their wording lives there too, under `usageDescriptions`.
 *
 * Everything else is dropped: the native screens use craft.app,
 * craft.navigation, craft.route, craft.secureStorage and craft.snapshots, and
 * config/mobile.ts already records that geolocation, biometric and push are
 * "NOT declared, deliberately" — so there is no Face ID prompt to explain.
 */
export const KEPT_KEYS: readonly string[] = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
]

/** Strips the unused usage descriptions. Returns the new source and what went. */
export function trimUsageDescriptions(plist: string): { source: string, removed: string[] } {
  const removed: string[] = []
  let source = plist

  for (const key of CRAFT_FORCED_KEYS) {
    if (KEPT_KEYS.includes(key))
      continue
    // The generated plist is flat: a key line, then its string on the next.
    const pair = new RegExp(
      `[ \\t]*<key>${key}</key>\\s*\\n[ \\t]*<string>[\\s\\S]*?</string>[ \\t]*\\n`,
      'g',
    )
    const before = source
    source = source.replace(pair, '')
    if (before !== source)
      removed.push(key)
  }

  return { source, removed }
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

  const { source, removed } = trimUsageDescriptions(original)

  // A plist that still carries a key we meant to drop means the generator's
  // shape changed under us, and silence would hand Apple the old list again.
  const survivors = CRAFT_FORCED_KEYS.filter(k => !KEPT_KEYS.includes(k) && source.includes(k))
  if (survivors.length) {
    console.error(`[ios-permissions] could not remove from Info.plist: ${survivors.join(', ')}`)
    console.error('[ios-permissions] Craft\'s plist shape has changed; update this script.')
    process.exit(1)
  }

  if (source !== original)
    writeFileSync(plistPath, source)

  console.warn(`[ios-permissions] ${KEPT_KEYS.length} kept, ${removed.length} removed`)
}

if (import.meta.main)
  run(process.cwd())
