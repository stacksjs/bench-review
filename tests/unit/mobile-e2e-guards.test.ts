import { describe, expect, test } from 'bun:test'
import { isLoopback, resolveMobileServer, serverArgument } from '../../scripts/mobile-target'
import { junitSummary } from '../../scripts/run-mobile-e2e'

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
