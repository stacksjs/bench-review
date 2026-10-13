import process from 'node:process'
import { afterEach, describe, expect, test } from 'bun:test'
import { disposableDomainCount, emailDomain, isDisposableEmail } from '../../app/Helpers/disposableEmail'
import { turnstileConfigured, verifyTurnstile } from '../../app/Helpers/turnstile'

/**
 * Signup abuse defenses — bench-review#51.
 *
 * Registration's only guard was `throttle:5,10m` on the route, so scripted
 * signups were a matter of rotating IPs. Bench publishes reviews of named,
 * sitting judges; cheap verified accounts are what harassment and
 * impersonation are built out of.
 *
 * The two properties worth holding down are the ones that fail SILENTLY if
 * they regress: that the blocklist anchors its suffix match (so it cannot
 * start eating legitimate domains), and that Turnstile fails CLOSED — a
 * verification that quietly passes when the answer is "no" or "I could not
 * ask" is worse than none, because the signup form still shows the widget.
 */

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY

afterEach(() => {
  if (ORIGINAL_SECRET === undefined)
    delete process.env.TURNSTILE_SECRET_KEY
  else
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET
  // Restore whatever the suite's fetch was; individual tests swap it.
  if ((globalThis as any).__realFetch) {
    globalThis.fetch = (globalThis as any).__realFetch
    delete (globalThis as any).__realFetch
  }
})

function stubFetch(impl: () => Promise<any> | any): void {
  ;(globalThis as any).__realFetch = globalThis.fetch
  globalThis.fetch = (async () => impl()) as any
}

describe('disposable email blocklist', () => {
  test('blocks the listed services, including their subdomains', () => {
    for (const addr of [
      'someone@mailinator.com',
      'someone@MAILINATOR.COM',
      'someone@throwaway.mailinator.com',
      'someone@guerrillamail.com',
      'someone@yopmail.fr',
      '  someone@temp-mail.org  ',
    ])
      expect(isDisposableEmail(addr)).toBe(true)
  })

  test('leaves real addresses alone', () => {
    for (const addr of [
      'clerk@courts.ca.gov',
      'someone@gmail.com',
      'someone@law.harvard.edu',
      // The suffix match is anchored on a dot. Without that anchor this
      // domain matches 'mailinator.com' by endsWith and a legitimate
      // signup is refused with no way for the person to tell why.
      'someone@notmailinator.com',
      'someone@mailinator.com.example.org',
    ])
      expect(isDisposableEmail(addr)).toBe(false)
  })

  test('malformed input is not a block', () => {
    for (const addr of ['', null, undefined, 'no-at-sign', 'trailing@'])
      expect(isDisposableEmail(addr)).toBe(false)
    expect(emailDomain('A@B.Com')).toBe('b.com')
  })

  test('the list is non-trivial', () => {
    // Guards against a merge that empties the set: every call above would
    // still return false and every test here except this one would pass.
    expect(disposableDomainCount()).toBeGreaterThan(30)
  })
})

describe('turnstile verification', () => {
  test('passes through when no secret is configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(turnstileConfigured()).toBe(false)
    // Local development has no keys and registration has to work there. The
    // conformance gate is what stops this becoming the production posture.
    expect((await verifyTurnstile('')).ok).toBe(true)
  })

  test('an absent token is refused once configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-xyz'
    const outcome = await verifyTurnstile('   ')
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('missing-token')
  })

  test('a negative verdict is refused, with Cloudflare codes kept for the log', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-xyz'
    stubFetch(() => ({ json: async () => ({ 'success': false, 'error-codes': ['invalid-input-response'] }) }))
    const outcome = await verifyTurnstile('token')
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('rejected')
    expect(outcome.codes).toEqual(['invalid-input-response'])
  })

  test('a successful verdict passes', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-xyz'
    stubFetch(() => ({ json: async () => ({ success: true }) }))
    expect((await verifyTurnstile('token')).ok).toBe(true)
  })

  test('an unreachable Cloudflare fails CLOSED', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-xyz'
    stubFetch(() => { throw new Error('network down') })
    const outcome = await verifyTurnstile('token')
    // Not ok. Failing open here would make the check skippable by anyone who
    // could induce an error, and would hide a real outage behind a form that
    // still appears to be protected.
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('unreachable')
  })

  test('an unparseable body fails CLOSED too', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-xyz'
    stubFetch(() => ({ json: async () => { throw new Error('not json') } }))
    expect((await verifyTurnstile('token')).reason).toBe('unreachable')
  })
})
