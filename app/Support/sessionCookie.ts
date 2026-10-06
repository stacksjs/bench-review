import { authCookie, clearAuthCookie } from '@stacksjs/auth'

/**
 * Session-cookie plumbing for the auth endpoints.
 *
 * ## Why this exists
 *
 * The session credential used to be written by the BROWSER:
 * `resources/stores/auth.ts` took the token out of the login JSON and did
 * `document.cookie = 'auth-token=…'`. A cookie set that way cannot be
 * `HttpOnly` — the whole point of `document.cookie` is that scripts can
 * write it, and anything a script can write a script can read. So the
 * session token sat in `document.cookie` for 30 days, readable by any
 * injected script. On an app whose core feature is rendering user-submitted
 * rich HTML, that turns a single XSS into full session theft, and the reviewer
 * anonymity the product promises is downstream of those sessions.
 *
 * The fix is to move the write to the server, where `HttpOnly` is available.
 *
 * ## Why this needed almost no new machinery
 *
 * The framework already does cookie auth end-to-end — the app simply wasn't
 * using it:
 *
 *   - `authCookie()` (`@stacksjs/auth`) serialises the cookie and ALWAYS
 *     includes `HttpOnly`. It resolves the name through `authCookieName()`
 *     (`config.auth.cookie.name`, else `defaultTokenName`, else `auth-token`),
 *     the lifetime from `config.auth.tokenExpiry`, and `Secure` from
 *     `shouldSecureAuthCookie()`, which deliberately omits `Secure` on
 *     loopback so sessions still work over plain-http localhost.
 *   - `requestToken()` (which `Auth.user()`, `Auth.logout()` and the `auth`
 *     middleware all route through) checks `bearerToken()`, then the
 *     `Authorization: Bearer` header, then FALLS BACK TO THE COOKIE. So the
 *     API already authenticates a cookie-only request. Nothing server-side had
 *     to change to accept this.
 *
 * `config/auth.ts` sets `defaultTokenName: 'auth-token'` and declares no
 * `cookie` block, so the resolved name is `auth-token` — which is already what
 * `resources/stores/auth.ts` and `resources/middleware/auth.ts` key off. The
 * three stay in lock-step for free.
 *
 * ## Consequences worth knowing
 *
 * - **The `/api/*` proxy is now load-bearing for auth, not just convenience.**
 *   The cookie is `SameSite=Lax`, so it is only sent on same-site requests. The
 *   deploy contract already requires the host to proxy `/api/*` onto the page
 *   origin (see DEPLOY.md); without it the cookie is never sent and every
 *   request is anonymous.
 * - **CSRF posture is unchanged, not worsened.** `requestToken()` already
 *   accepted the cookie before this change, so cookie-borne requests were
 *   always possible; `SameSite=Lax` is what blocks cross-site state change, and
 *   it withholds the cookie on cross-site POST/PUT/DELETE. That matters because
 *   every mutating route in `routes/api.ts` carries `.skipCsrf()`. It holds as
 *   long as no GET mutates state — currently true, and worth keeping true.
 */

/** JSON response that also installs the HttpOnly session cookie. */
export function withSessionCookie(body: unknown, token: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': authCookie(token),
      // A cached auth response would hand one visitor another's session.
      'Cache-Control': 'no-store',
    },
  })
}

/** JSON response that clears the session cookie. */
export function withClearedSessionCookie(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearAuthCookie(),
      'Cache-Control': 'no-store',
    },
  })
}
