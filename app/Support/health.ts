import type { ApplicationHealthResult } from '@stacksjs/router'
import { checkApplicationHealth } from '@stacksjs/router'

/**
 * The name this app answers to in its own health body.
 *
 * Matches `package.json` → `name`, which is also the key
 * `scripts/smoke-deployment.ts` and `scripts/validate-release.ts` resolve
 * their contracts by. Keep the three in step.
 */
export const APP = 'bench-review'

export interface HealthOptions {
  /**
   * The probe runner. Defaults to the framework's, which checks the database
   * (`SELECT 1`) and the cache (set, then delete) with a 1.5s timeout each.
   * Injectable so the failure path can be tested without taking a real
   * dependency down.
   */
  check?: () => Promise<ApplicationHealthResult>
  /** App-specific facts merged into the body. */
  extra?: Record<string, unknown>
}

/**
 * The health endpoint an uptime monitor can actually trust.
 *
 * ## Why this is registered by hand
 *
 * The framework already ships this as `route.health()` from
 * `storage/framework/defaults/routes/dashboard.ts`, but reaching it depends on
 * conditions that have nothing to do with health:
 *
 *   - `config/dashboard.ts` → `enabled`. Turning off the admin UI also removes
 *     `/api/health`. bench-review has no `config/dashboard.ts` at all, so there
 *     is nothing guaranteeing that call site runs.
 *   - the vendored `storage/framework/` tree reaching the box. bench's
 *     production artifact is a pre-rendered `dist/` plus the API process; the
 *     framework defaults are not something the deploy contract promises.
 *
 * Registering it here makes the endpoint a property of this app rather than of
 * a UI flag and a build artifact. User routes load before the framework's, so
 * this also wins wherever the default one is present.
 *
 * ## Why not a static 200
 *
 * A literal `{ status: 'ok' }` cannot fail: it returns 200 with the database
 * down, the cache gone, and every page 500ing. Pointing a monitor at it would
 * produce a green dashboard straight through an outage — worse than having no
 * monitor at all, because one is a known gap and the other is a false
 * assurance.
 *
 * Answering 503 on a failed probe is what makes this readable by a plain HTTP
 * check, so no monitor has to understand the body to get the right answer.
 *
 * ## Route registration
 *
 * `routes/api.ts` auto-prefixes every path with `/api` (stacksjs/stacks#1835),
 * so the declaration there is a bare `/health` and the served path is
 * `/api/health`. Do not declare `/api/health` in that file — it becomes
 * `/api/api/health`.
 */
export async function healthResponse(options: HealthOptions = {}): Promise<Response> {
  const check = options.check ?? checkApplicationHealth

  let health: ApplicationHealthResult
  try {
    health = await check()
  }
  catch (err) {
    // A probe runner that throws is itself a failure, and reporting it as one
    // beats a 500 from an unhandled rejection: the monitor gets a body it can
    // read rather than an opaque error page.
    health = {
      status: 'degraded',
      checks: { probe: { ok: false, ms: 0, message: err instanceof Error ? err.message : String(err) } },
      timestamp: Date.now(),
    }
  }

  return new Response(JSON.stringify({ app: APP, ...health, ...(options.extra ?? {}) }), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      // A cached health check reports the past. Nothing between us and the
      // monitor may answer this from a store.
      'Cache-Control': 'no-store',
    },
  })
}
