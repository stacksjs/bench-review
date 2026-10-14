import type { ApplicationHealthResult } from '@stacksjs/router'
import process from 'node:process'
import { checkApplicationHealth } from '@stacksjs/router'
import filesystems from '../../config/filesystems'

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
 * Is this deployment configured to keep the files people upload?
 *
 * The `local` disk writes under `storage/` and hands back `/storage/...` URLs
 * that nothing serves, on a filesystem that a redeploy replaces. In production
 * that means every review photo and avatar 404s and then evaporates — and
 * because uploads are the highest-risk content this site accepts, losing them
 * silently is also losing the evidence attached to a report.
 *
 * It is a configuration mistake, not a code one, and configuration mistakes
 * are invisible until someone goes looking. So the health endpoint — the thing
 * already being watched — answers for it (bench-review#55).
 *
 * Deliberately only in production. `local` is the right default everywhere
 * else and a red light in development would train people to ignore this one.
 */
export function uploadsDiskCheck(): { ok: boolean, disk: string, message?: string } {
  const disk = String((filesystems as any)?.default ?? 'local')
  const env = String(process.env.APP_ENV ?? '').toLowerCase()
  const isProduction = env === 'production' || env === 'prod'

  if (!isProduction || disk !== 'local')
    return { ok: true, disk }

  return {
    ok: false,
    disk,
    message: 'FILESYSTEM_DISK=local in production: uploaded photos are served from a path nothing routes and are destroyed on redeploy. Set FILESYSTEM_DISK=s3.',
  }
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

  // Merged in rather than left to the framework's probe set, which only knows
  // about the database and the cache.
  const uploads = uploadsDiskCheck()
  const checks = { ...health.checks, uploads: { ok: uploads.ok, ms: 0, message: uploads.message ?? `disk=${uploads.disk}` } }
  const status = health.status === 'healthy' && !uploads.ok ? 'degraded' : health.status

  return new Response(JSON.stringify({ app: APP, ...health, checks, status, ...(options.extra ?? {}) }), {
    status: status === 'healthy' ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      // A cached health check reports the past. Nothing between us and the
      // monitor may answer this from a store.
      'Cache-Control': 'no-store',
    },
  })
}
