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
export default function guestMiddleware(req: Request, ctx: MiddlewareContext): Response | null {
  const token = ctx.cookies['auth-token']
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
