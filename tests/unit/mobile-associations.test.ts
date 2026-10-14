import { rmSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { applinkComponents, generateMobileAssociations } from '../../scripts/generate-mobile-associations'

/**
 * Universal links — bench-review#80.
 *
 * `config/mobile.ts` entitles `applinks:benchreview.org`, which is half of a
 * universal link. iOS fetches `/.well-known/apple-app-site-association` for the
 * other half and will not open a link in the app unless that file names the
 * exact team+bundle and claims the path.
 *
 * Every mistake here is SILENT: iOS declines and opens Safari, so a broken
 * association is indistinguishable from not having the feature. That is why
 * the policy is pinned here rather than left to a tap on a device.
 */

const STAGE = 'tests/temp/assoc'

describe('apple-app-site-association', () => {
  test('exclusions come before the inclusions they carve out of', () => {
    const components = applinkComponents()
    const firstInclude = components.findIndex(c => !c.exclude)
    const lastExclude = components.map(c => !!c.exclude).lastIndexOf(true)

    // iOS takes the FIRST matching component. An exclusion listed after the
    // include it is meant to carve out of is simply never reached — the rule
    // is present in the file and does nothing, which is the hardest version of
    // this bug to see.
    expect(firstInclude).toBeGreaterThan(-1)
    expect(lastExclude).toBeLessThan(firstInclude)
  })

  test('the admin surface is never a link target', () => {
    const claimed = applinkComponents().filter(c => !c.exclude).map(c => String(c['/']))
    expect(claimed.some(p => p.startsWith('/admin'))).toBe(false)

    const excluded = applinkComponents().filter(c => c.exclude).map(c => String(c['/']))
    // It is where an anonymized reviewer can be unmasked; it should be reached
    // from a browser the person chose.
    expect(excluded).toContain('/admin/*')
  })

  test('one-time credential links stay in the browser that asked for them', () => {
    const excluded = applinkComponents().filter(c => c.exclude).map(c => String(c['/']))
    expect(excluded).toContain('/reset-password*')
    expect(excluded).toContain('/verify-email/*')
    expect(excluded).toContain('/login')
  })

  test('the shareable content routes are claimed', () => {
    const claimed = applinkComponents().filter(c => !c.exclude).map(c => String(c['/']))
    // `navigator.share` is called from the judge profile, so that is the path
    // a shared link actually lands on.
    expect(claimed).toContain('/judges/*')
    expect(claimed).toContain('/court-houses/*')
    expect(claimed).toContain('/article/*')
  })

  test('nothing is written without a team id, and the absence is the signal', async () => {
    const written = await generateMobileAssociations({ APPLE_TEAM_ID: undefined }, STAGE)
    expect(written).toEqual([])
  })

  test('the appID is team + bundle, exactly', async () => {
    try {
      const written = await generateMobileAssociations(
        { APPLE_TEAM_ID: ' TEAM123456 ', IOS_BUNDLE_ID: ' org.example.app ' },
        STAGE,
      )
      expect(written).toHaveLength(1)

      const parsed = await Bun.file(written[0]).json()
      // Whitespace from an env var must not end up inside the identifier.
      expect(parsed.applinks.details[0].appIDs).toEqual(['TEAM123456.org.example.app'])

      // Claiming webcredentials would assert a capability config/mobile.ts does
      // not entitle (`applinks:` only).
      expect(parsed.webcredentials).toBeUndefined()
    }
    finally {
      rmSync(STAGE, { recursive: true, force: true })
    }
  })

  test('the bundle id defaults to the one config/mobile.ts falls back to', async () => {
    try {
      const [path] = await generateMobileAssociations({ APPLE_TEAM_ID: 'TEAM123456' }, STAGE)
      const parsed = await Bun.file(path).json()
      // The two defaults have to agree or the association names an app that
      // was never built.
      expect(parsed.applinks.details[0].appIDs).toEqual(['TEAM123456.org.benchreview.app'])
    }
    finally {
      rmSync(STAGE, { recursive: true, force: true })
    }
  })
})
