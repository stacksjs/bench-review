import type { MiddlewareContext } from 'bun-plugin-stx/serve'

/**
 * `guest` middleware — the inverse of `auth`. Bounces logged-in users
 * away from auth-only pages (login, register, forgot-password) so
 * they don't get prompted to sign in again when they're already
 * authenticated.
 *
 * Add to those views:
 *
 *     <script server>
 *       definePageMeta({ middleware: ['guest'] })
 *     </script>
 */
// eslint-disable-next-line pickier/no-unused-vars -- `req` is fixed by the middleware signature; only `ctx` is used
export default function guestMiddleware(req: Request, ctx: MiddlewareContext): Response | null {
  // No context at build time. The static generator runs guards with no request
  // behind them, so `ctx.cookies` is undefined and reading it threw — which
  // aborted /login and /register mid-build and dropped them from the sitemap.
  // Nobody had seen it, because an unregistered guard used to fail open and
  // this file was never loaded at all (its directory was not on the configured
  // middleware path). Absent cookies means "not signed in", which is the right
  // answer for a page being pre-rendered: emit the guest version and let the
  // guard do its real work per-request.
  const token = ctx?.cookies?.['auth-token']
  if (token) {
    // Send authenticated users back to their profile rather than the
    // root — the root is public chrome but profile is the canonical
    // "you are signed in" landing page for bench-review.
    return new Response(null, {
      status: 302,
      headers: { Location: '/profile' },
    })
  }
  return null
}
