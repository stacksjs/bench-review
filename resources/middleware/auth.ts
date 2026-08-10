import type { MiddlewareContext } from 'bun-plugin-stx/serve'

/**
 * Server-side `auth` middleware. Overrides stx-serve's built-in
 * cookie-presence check with something the production app actually
 * wants: a real token validation hook the API layer can plug into.
 *
 * Pages opt in with:
 *
 *     <script server>
 *       definePageMeta({ middleware: ['auth'] })
 *     </script>
 *
 * Auto-discovered by the framework default in
 * `storage/framework/core/actions/src/helpers/utils.ts` — anything
 * under `resources/middleware/*.ts` gets registered by filename. The
 * built-in `auth`/`guest` handlers stay registered too; this file
 * wins because Object.assign merges user-defined names last.
 *
 * Returning a `Response` short-circuits the request (typical: 302 to
 * /login via `ctx.redirect`). Returning `null` lets the page render.
 */
// eslint-disable-next-line pickier/no-unused-vars -- `req` is fixed by the middleware signature; only `ctx` is used
export default function authMiddleware(req: Request, ctx: MiddlewareContext): Response | null {
  // The cookie name MUST stay in lock-step with the SPA store's
  // `AUTH_COOKIE` (resources/stores/auth.ts) and
  // `config.auth.defaultTokenName`. All three keying off the same
  // value is how the SPA, server-side gate, and config stay coherent.
  // `ctx?.cookies?.` — the static generator runs guards with no request behind
  // them, so this is undefined at build time and reading it threw, aborting the
  // page instead of generating it. Treating that as "no token" is correct: the
  // pre-rendered artifact for a gated route should be the redirect shell, which
  // is what it already was.
  const token = ctx?.cookies?.['auth-token']
  if (!token)
    return ctx?.redirect ? ctx.redirect('/login') : new Response(null, { status: 302, headers: { Location: '/login' } })

  // Future hook: server-side token validation. When the SPA logout
  // doesn't reach the API (network blip, tab closed mid-request), the
  // cookie can linger past the row in `personal_access_tokens`. A
  // lookup against that table here would catch it.
  //
  // Kept synchronous + token-presence-only for now to avoid blocking
  // every page render on a DB roundtrip. Move to an async check
  // (`async function ... await db.selectFrom('personal_access_tokens')…`)
  // when the security tradeoff is worth the latency.

  return null
}
