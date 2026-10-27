import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { CRAFT_FORCED_KEYS, KEPT } from '../../scripts/trim-ios-permissions'

/**
 * What the iOS project is allowed to carry once it is committed.
 *
 * The project under `storage/framework/mobile/ios` is generated, and it is
 * tracked anyway: Xcode Cloud builds from the repository, so a project that
 * exists only on the machine that generated it cannot be built there. That
 * is how hq.training ships, and `./buddy release:ios` regenerates and commits
 * it as part of cutting a build.
 *
 * ⚠️ WHICH MAKES THE BUILD-TIME SERVER A RELEASE HAZARD. The app's server is
 * fixed when the project is generated, not at runtime, and the e2e runner
 * generates this exact tree with `MOBILE_URL=http://localhost:4399`. Commit
 * that tree and the release installs, launches, and reaches nothing on every
 * screen — it would pass every check that does not open the app on a device
 * with no fixture running beside it.
 *
 * hq.training's runbook says it in one line — "Never commit a simulator
 * build's development URL" — which is a rule someone has to remember at the
 * exact moment they are least likely to. This is that rule, enforced.
 *
 * It reads what git TRACKS, not what is on disk: a local simulator build
 * sitting uncommitted is normal and fine, and is what every e2e run leaves
 * behind.
 */

const projectRoot = join(import.meta.dir, '../..')
const iosRoot = 'storage/framework/mobile/ios'

/**
 * Loopback ENDPOINTS — a URL or a host:port the shipped app would try to reach.
 *
 * Deliberately NOT a bare hostname match. Craft generates an
 * NSAppTransportSecurity exception for `localhost` into Info.plist on every
 * build, production included:
 *
 *     <key>NSExceptionDomains</key>
 *     <dict><key>localhost</key>…
 *
 * That is a platform setting, not somewhere the app points. Matching it would
 * make this guard unsatisfiable — the tree could never be committed however
 * correctly it was generated — and a guard that cannot go green gets deleted
 * or ignored, which costs more than it saves.
 *
 * So the pattern requires a scheme or a port, which is what distinguishes
 * "this build talks to my laptop" from "this plist names a hostname". Both
 * halves of the original hazard still match: `http://localhost:4399` baked
 * into stacks-mobile.json / craft.config.json by the e2e runner, and a
 * `Sitemap: http://localhost:4000/…` left in a dist/ built with a dev APP_URL.
 */
const LOOPBACK_HOST = String.raw`(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])`
const LOOPBACK = new RegExp(
  // scheme://loopback          e.g. http://localhost, ws://127.0.0.1
  String.raw`[a-z][a-z0-9+.-]*://${LOOPBACK_HOST}`
  // or loopback:port           e.g. localhost:4399
  + String.raw`|${LOOPBACK_HOST}:\d+`,
  'i',
)

function trackedIosFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files', iosRoot], { cwd: projectRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  }
  catch {
    return []
  }
}

/** Binary and bundled assets are not worth scanning and are not where a URL is configured. */
function isScannable(path: string): boolean {
  return /\.(?:json|plist|yml|yaml|swift|entitlements|pbxproj|sh|toml|txt|xcprivacy)$/.test(path)
}

describe('the committed iOS project', () => {
  const tracked = trackedIosFiles()

  test('carries no loopback URL', () => {
    // Empty until the first `./buddy release:ios` commits the tree. That is a
    // pass, not a skip: there is nothing committed that could be wrong yet.
    const offenders: string[] = []
    for (const file of tracked.filter(isScannable)) {
      let source = ''
      try {
        source = readFileSync(join(projectRoot, file), 'utf8')
      }
      catch {
        continue
      }
      const line = source.split('\n').find(l => LOOPBACK.test(l))
      if (line)
        offenders.push(`${file}: ${line.trim().slice(0, 100)}`)
    }

    expect(offenders).toEqual([])
  })

  test('the guard can actually see the tree it guards', () => {
    // A guard that silently found no files would pass forever, including on
    // the day someone commits a localhost build. If the tree is tracked at
    // all, the scan must be reaching real files.
    if (!tracked.length)
      return
    expect(tracked.filter(isScannable).length).toBeGreaterThan(0)
  })
})

describe('the committed Info.plist', () => {
  const tracked = trackedIosFiles()
  const plistPath = `${iosRoot}/Info.plist`

  function plist(): string | null {
    if (!tracked.includes(plistPath))
      return null
    try {
      return readFileSync(join(projectRoot, plistPath), 'utf8')
    }
    catch {
      return null
    }
  }

  test('declares no permission the app does not use', () => {
    // Craft forces all eleven NS*UsageDescription keys into every generated
    // project regardless of the declared capabilities, because its
    // LINKED_PURPOSES fallback emits a placeholder rather than omitting the
    // key. scripts/trim-ios-permissions.ts removes the ones bench does not
    // use; this fails if a regeneration lands without that step, which is the
    // only way the list comes back.
    //
    // Permissions an app does not use, with vague purpose strings, are a
    // documented App Review rejection reason — and the strings are what iOS
    // shows a person at the prompt, so they are a claim we have to mean.
    const source = plist()
    if (source === null)
      return

    const unexpected = CRAFT_FORCED_KEYS.filter(key => !KEPT[key] && source.includes(key))
    expect(unexpected).toEqual([])
  })

  test('keeps a real purpose string for each permission it does declare', () => {
    const source = plist()
    if (source === null)
      return

    // The generator's placeholder explains nothing: "… asks for the camera
    // only in a feature that needs it."
    expect(source).not.toContain('only in a feature that needs it')

    for (const [key, expected] of Object.entries(KEPT)) {
      expect(source).toContain(key)
      expect(source).toContain(expected)
    }
  })

  test('the two it keeps are the two capabilities that need them', () => {
    // A guard on the guard: if this list ever empties, the first test above
    // would pass vacuously while declaring nothing at all.
    expect(Object.keys(KEPT).sort()).toEqual([
      'NSCameraUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ])
  })
})
