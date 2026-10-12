import { describe, expect, test } from 'bun:test'
import { buildRobotsTxt, buildSitemapXml } from '../../app/Helpers/sitemap'

/**
 * The invariant: **nothing the sitemap advertises may be disallowed by
 * robots.txt.**
 *
 * This is the bug CI found the first time the conformance gate ran on a
 * runner. `buildSitemapXml` used to query the database before writing a
 * single static path, so an unreachable one threw, `build.ts` caught it and
 * logged "sitemap/robots generation skipped", and the stock page-derived
 * sitemap `buildApp()` emits survived — advertising /admin/users,
 * /admin/reviews, /settings, /profile and /my-reviews. The build reported
 * success.
 *
 * These run in both worlds deliberately. With a database they check ~2,900
 * URLs; without one the entity queries fail soft and they check the static
 * paths. The invariant is the same either way, which is the point: the
 * sitemap must be correct even when the build is impoverished.
 */

const BASE = 'https://benchreview.org'

function disallowedPrefixes(robots: string): string[] {
  return [...robots.matchAll(/^Disallow:\s*(\S+)/gm)]
    .map(m => m[1])
    // A bare `/` would mean "nothing may be indexed" and is not a prefix
    // rule to test paths against.
    .filter(p => p !== '/')
}

describe('sitemap and robots.txt', () => {
  test('no advertised URL is disallowed', async () => {
    const [xml, robots] = [await buildSitemapXml(BASE), buildRobotsTxt(BASE)]
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    const blocked = disallowedPrefixes(robots)

    expect(locs.length).toBeGreaterThan(0)
    expect(blocked.length).toBeGreaterThan(0)

    const contradictions = locs.filter(loc =>
      blocked.some(prefix => new URL(loc).pathname.startsWith(prefix)))
    expect(contradictions).toEqual([])
  })

  // Named explicitly rather than left to the prefix sweep above, because
  // these are the paths that actually shipped in the broken artifact.
  test('never advertises the admin panel or an account page', async () => {
    const xml = await buildSitemapXml(BASE)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

    expect(locs.filter(l => l.includes('/admin'))).toEqual([])
    expect(locs.filter(l => /\/(settings|profile|my-reviews|notifications|reset-password|forgot-password|paywall)/.test(l))).toEqual([])
  })

  test('is built from the host it is given, not a hardcoded one', async () => {
    const xml = await buildSitemapXml(BASE)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

    expect(locs.every(l => l.startsWith(BASE))).toBe(true)
    expect(locs.some(l => /localhost|127\.0\.0\.1/.test(l))).toBe(false)
  })

  test('robots advertises the sitemap at the origin, outside any disallowed path', () => {
    const robots = buildRobotsTxt(BASE)
    const line = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1]

    expect(line).toBe(`${BASE}/sitemap.xml`)
    // The whole point of the earlier bug on this line: it used to point at
    // /api/sitemap.xml while robots disallowed /api/.
    expect(disallowedPrefixes(robots).some(p => new URL(line!).pathname.startsWith(p))).toBe(false)
  })
})
