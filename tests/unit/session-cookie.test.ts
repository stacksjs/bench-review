import { describe, expect, test } from 'bun:test'
import { authCookie, authCookieName, authCookieToken, clearAuthCookie } from '@stacksjs/auth'
import { withClearedSessionCookie, withSessionCookie } from '../../app/Support/sessionCookie'

/**
 * The security property these tests exist to pin down:
 *
 *   the session credential must not be readable from JavaScript.
 *
 * Before this, `resources/stores/auth.ts` wrote the token with
 * `document.cookie`, which can never be HttpOnly. The fix moved the write to
 * the server. These tests assert the three things that has to mean in
 * practice: the cookie carries HttpOnly, the server can read back what it set,
 * and logout actually expires it.
 *
 * They are deliberately about the cookie contract rather than a full login
 * round-trip — that needs a running API and a seeded user, so it belongs in a
 * feature test against the dev server.
 */

const TOKEN = 'test-plain-token:encrypted-id-payload'

describe('session cookie', () => {
  test('is HttpOnly, scoped to the whole site, and SameSite=Lax', () => {
    const cookie = authCookie(TOKEN)

    // The entire point of the change.
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/')
    // Lax, not Strict: a deep link back into /profile from an external
    // referrer still has to carry the session so the server-side page gate
    // (resources/middleware/auth.ts) sees it. Lax is also what withholds the
    // cookie on cross-site POST, which is what keeps `.skipCsrf()` defensible.
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toMatch(/Max-Age=\d+/)
  })

  test('uses the cookie name the rest of the app keys off', () => {
    // config/auth.ts sets defaultTokenName: 'auth-token' and declares no
    // cookie block, so this must resolve to 'auth-token' — the same literal
    // resources/middleware/auth.ts reads out of ctx.cookies. If this ever
    // drifts, the page-level auth gate stops seeing sessions.
    expect(authCookieName()).toBe('auth-token')
    expect(authCookie(TOKEN).startsWith('auth-token=')).toBe(true)
  })

  test('round-trips: the server can read back the token it set', () => {
    // authCookieToken() is what requestToken() falls back to, so this is the
    // actual path a cookie-only request authenticates through.
    const request = new Request('https://benchreview.org/api/me', {
      headers: { cookie: authCookie(TOKEN).split(';')[0] },
    })

    expect(authCookieToken(request)).toBe(TOKEN)
  })

  test('clearing expires the cookie rather than setting a value', () => {
    const cleared = clearAuthCookie()

    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('HttpOnly')
    expect(cleared.startsWith('auth-token=')).toBe(true)
  })

  test('omits Secure on loopback so local http sessions still work', () => {
    // Browsers drop Secure cookies on plain http, so forcing it would break
    // every localhost login. shouldSecureAuthCookie() handles this; the test
    // guards the behaviour rather than the implementation.
    const cookie = authCookie(TOKEN, { secure: false })
    expect(cookie).not.toContain('Secure')

    expect(authCookie(TOKEN, { secure: true })).toContain('Secure')
  })
})

describe('auth responses', () => {
  test('withSessionCookie installs the cookie and stays uncacheable', async () => {
    const res = withSessionCookie({ token: TOKEN, user: { id: 1 } }, TOKEN)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('auth-token=')
    // A cached auth response would hand one visitor another's session.
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.status).toBe(200)

    // The JSON body still carries the framework's shape for non-browser clients.
    expect(await res.json()).toEqual({ token: TOKEN, user: { id: 1 } })
  })

  test('withClearedSessionCookie expires the cookie', async () => {
    const res = withClearedSessionCookie({ message: 'Successfully logged out' })

    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ message: 'Successfully logged out' })
  })
})

describe('Request model is not an auto-CRUD surface', () => {
  test('declares routes: [] so the ORM generator emits nothing', async () => {
    const model = (await import('../../app/Models/Request')).default as {
      traits?: { useApi?: unknown }
    }
    const useApi = model.traits?.useApi as { uri?: string, routes?: string[] } | boolean | undefined

    // `useApi: true` (the previous value) means the generator defaults to
    // index + show + store + update + destroy + bulk-delete, all with no 401
    // path. The `requests` table holds ip_address and user_agent, so a
    // readable one is a de-anonymisation primitive on an app built around
    // anonymous reviews.
    expect(typeof useApi).toBe('object')
    expect((useApi as { routes?: string[] }).routes).toEqual([])
  })
})
