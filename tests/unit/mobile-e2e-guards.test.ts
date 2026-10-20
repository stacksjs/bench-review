import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { handle } from '../../scripts/mobile-e2e-api'
import { isLoopback, resolveMobileServer, serverArgument } from '../../scripts/mobile-target'
import { junitSummary, wantsOfflineServer } from '../../scripts/run-mobile-e2e'

/**
 * Guards around the iOS e2e run — bench-review#81.
 *
 * The suite's job is to fail when the app is wrong. These cover the two ways
 * it could quietly fail to do that: by testing a build pointed somewhere it
 * cannot reach, and by reporting success for a run that executed nothing.
 */

describe('mobile build target', () => {
  test('a phone is refused a loopback server, with the reason', () => {
    // The failure this prevents is near-invisible on a device: the app opens
    // on a dead server and drops to its bundled copy, so the site looks empty
    // rather than misconfigured.
    expect(() => resolveMobileServer('http://localhost:4000', 'device')).toThrow(/cannot reach/i)
    // A simulator shares the Mac's network stack, so the same URL is fine.
    expect(resolveMobileServer('http://localhost:4000', 'simulator')).toBe('http://localhost:4000')
  })

  test('plain http is refused for anything that is not this Mac', () => {
    expect(() => resolveMobileServer('http://benchreview.org', 'simulator')).toThrow(/https/i)
    expect(resolveMobileServer('https://benchreview.org', 'device')).toBe('https://benchreview.org')
  })

  test('a scheme-less value is refused rather than guessed at', () => {
    // The generator used to prepend https:// silently, which turned a typo
    // into a build pointed at a host nobody chose.
    expect(() => resolveMobileServer('localhost:4000', 'simulator')).toThrow(/absolute/i)
    expect(() => resolveMobileServer('ftp://example.com', 'simulator')).toThrow(/absolute/i)
  })

  test('the default is production', () => {
    expect(resolveMobileServer(undefined, 'device')).toBe('https://benchreview.org')
    expect(resolveMobileServer('   ', 'device')).toBe('https://benchreview.org')
  })

  test('loopback detection covers the three spellings', () => {
    for (const host of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/'])
      expect(isLoopback(new URL(host))).toBe(true)
    expect(isLoopback(new URL('https://benchreview.org/'))).toBe(false)
  })

  test('--server is read in both spellings and refuses an empty value', () => {
    expect(serverArgument(['--server=http://localhost:4000'])).toBe('http://localhost:4000')
    expect(serverArgument(['--server', 'http://localhost:4000'])).toBe('http://localhost:4000')
    expect(serverArgument(['--flow=01'])).toBeUndefined()
    expect(() => serverArgument(['--server', '--flow=01'])).toThrow()
  })
})

describe('maestro report reading', () => {
  test('a run that executed nothing is not a pass', () => {
    // Maestro exits 0 when it matches no flows. Reading tests="0" as success
    // is how a suite reports green while testing nothing at all.
    expect(junitSummary('<testsuites tests="0" failures="0"/>')).toEqual({ tests: 0, failures: 0 })
  })

  test('failures and errors both count as failures', () => {
    expect(junitSummary('<testsuites tests="3" failures="1" errors="0"/>').failures).toBe(1)
    // An errored flow (a crash, a missing element) is not a pass either.
    expect(junitSummary('<testsuites tests="3" failures="0" errors="2"/>').failures).toBe(2)
    expect(junitSummary('<testsuites tests="4" failures="0" errors="0"/>')).toEqual({ tests: 4, failures: 0 })
  })
})

describe('which flows need the server stopped', () => {
  const flow = (tags: string): string => `appId: x\nname: n\ntags:\n${tags}---\n- launchApp\n`

  test('the tag is read from the flow, not from its filename', () => {
    expect(wantsOfflineServer(flow('  - mobile\n  - offline\n'))).toBe(true)
    expect(wantsOfflineServer(flow('  - mobile\n  - smoke\n'))).toBe(false)
  })

  test('a tag in the BODY does not count', () => {
    // Only the front matter declares what a flow needs. A step that happens
    // to mention the word must not switch the server off under every flow
    // that talks about being offline — including the ones asserting that the
    // offline state is ABSENT.
    const body = 'appId: x\nname: n\ntags:\n  - smoke\n---\n- assertNotVisible: "offline"\n  - offline\n'
    expect(wantsOfflineServer(body)).toBe(false)
  })

  test('the offline flow in this repo is actually tagged', () => {
    // The guard above is only worth having if the flow it protects carries
    // the tag. Untagged, 04 would run with the fixture UP and assert offline
    // copy that never appears — a red suite, but for the wrong reason, and
    // the opposite mistake (asserting it is absent) would pass silently.
    const source = readFileSync(join(import.meta.dir, '../../.maestro/flows/04-offline.yaml'), 'utf8')
    expect(wantsOfflineServer(source)).toBe(true)
  })
})

describe('the e2e fixture api', () => {
  const get = (path: string): any => {
    const response = handle(new Request(`http://localhost/api${path}`))
    return { status: response.status, body: response.json() }
  }

  test('the directory answers a bare array, the paged endpoints an envelope', async () => {
    // The screens read these differently, and the shapes are not
    // interchangeable: a directory handed an envelope renders nothing.
    expect(Array.isArray(await get('/judges').body)).toBe(true)
    expect(await get('/reviews').body).toMatchObject({ current_page: 1, last_page: expect.any(Number) })
  })

  test('a courthouse bench is filtered, and an unknown one is a 404', async () => {
    const bench = get('/court-houses/2/judges')
    expect(bench.status).toBe(200)
    const names = (await bench.body).data.map((j: any) => j.name)
    expect(names).toContain('Fixture C. Cedar')
    expect(names).not.toContain('Fixture A. Alder')
    // Distinct from an empty bench, which is what the real action does.
    expect(get('/court-houses/99/judges').status).toBe(404)
  })

  test('bodies carry the escaped HTML the screens have to decode', async () => {
    // The fixture is only useful for this if it reproduces the shape the bugs
    // were about (dcf1cadb, 74a4397c).
    const feed = await get('/reviews').body
    expect(feed.data[0].content).toContain('&amp;')
    const opinions = await get('/judges/1/opinions').body
    expect(opinions.data[0].summary).toContain('&rsquo;')
  })

  test('the judge with no education is as real as the one with it', async () => {
    expect((await get('/judges/1/education').body).education.length).toBeGreaterThan(0)
    expect((await get('/judges/2/education').body).education).toEqual([])
  })
})
