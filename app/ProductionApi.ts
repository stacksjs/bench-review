import process from 'node:process'
import { log } from '@stacksjs/cli'
import { app, ports } from '@stacksjs/config'
import { route, serve } from '@stacksjs/router'
import { handleEvents } from './Listener'

/**
 * The API, as a production process.
 *
 * bench deploys two independent artifacts (see DEPLOY.md): the pre-rendered
 * dist/, served by preview.ts, and this — bun-router serving /api/*.
 *
 * ## Why this file exists
 *
 * The framework ships storage/framework/api/dev.ts, which is a real and
 * working bun-router server, and for a long time DEPLOY.md pointed production
 * at a 'dev/api.ts' that has never existed in this repository. Neither is a
 * production entry:
 *
 *   - dev.ts calls watchFolders(), which sets recursive fs.watch on
 *     storage/framework/core, routes/, app/Actions, app/Controllers,
 *     app/Middleware and the model paths, and re-runs code generation on
 *     change. That is gated on 'globalThis.counter === 1' — a HOT-RELOAD
 *     COUNTER, not an environment check — so a fresh production process has
 *     counter 1 and the watchers fire. One of those paths,
 *     storage/framework/core, is the 168MB tree the migration plan deletes.
 *
 *   - './buddy serve' is the framework's production server, but it PROXIES
 *     /api rather than hosting it, so it presupposes this process instead of
 *     replacing it. It also renders stx at runtime, which is a different
 *     architecture from bench's build-time SSG.
 *
 * So this is dev.ts with the development machinery removed, plus the two
 * things a supervised process needs that dev.ts does not have.
 *
 * ## 1. Routes are loaded EAGERLY here
 *
 * The router loads the route registry lazily, on the first request that
 * arrives (handleServerRequestBeforeRoutes checks a null routesLoadPromise).
 * That means a registry that throws — a missing named export, a model that
 * fails to resolve — produces a process that starts cleanly, reports healthy,
 * and then fails every request. That is the silent-4008 pattern this project
 * has already lost time to once.
 *
 * Importing them before serve() moves that failure to boot, where the deploy's
 * health check and systemd both see it, and where a bad release is rolled back
 * instead of being served.
 *
 * ## 2. SIGTERM is handled
 *
 * dev.ts handles SIGINT only, which is Ctrl-C. systemd stops a unit with
 * SIGTERM and SIGKILLs it after the timeout, so a SIGINT-only process is
 * always hard-killed on every deploy and restart — mid-request, with no chance
 * to drain.
 */

async function main(): Promise<void> {
  // Fail loudly here rather than silently on the first request. See above.
  try {
    await route.importRoutes()
  }
  catch (error) {
    log.error('[api] Route registry failed to load; refusing to start.', error)
    process.exit(1)
  }

  await serve({
    port: ports.api || 3008,
    timezone: app.timezone || 'UTC',
  } as any)

  handleEvents()

  log.info(`[api] Listening on http://127.0.0.1:${ports.api || 3008}`)
}

// SIGTERM is what a supervisor sends; SIGINT is what a terminal sends.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log.info(`[api] Received ${signal}, shutting down.`)
    process.exit(0)
  })
}

main().catch((error) => {
  log.error('[api] Failed to start.', error)
  process.exit(1)
})
