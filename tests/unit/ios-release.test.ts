import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

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

/** Hosts that mean "this build only works on the machine that made it". */
const LOOPBACK = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])\b/

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
