// Prefer the pantry-vendored bun-plugin-stx so framework fixes shipped
// via `pantry/install` (or a manual sync from the linked source) take
// effect even when node_modules has an older registry copy. Mirrors
// the resolution path used by `storage/framework/core/actions/src/dev/views.ts`.
import path from 'node:path'

let serve: any
try {
  ;({ serve } = await import(path.resolve(import.meta.dir, 'pantry/bun-plugin-stx/dist/serve.js')))
}
catch {
  ;({ serve } = await import('bun-plugin-stx/serve'))
}

const PORT = Number.parseInt(process.env.PORT || '3000')
const API_PORT = Number.parseInt(process.env.PORT_API || '4008')
// Bind to IPv4 explicitly — on macOS, Bun's fetch resolves `localhost`
// to ::1 (IPv6) first, but `Bun.serve` listens on IPv4 only by default.
// Result: ConnectionRefused even though the API is up.
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

/**
 * Why this file exists at all
 * ---------------------------
 *
 * `serve.ts` is the page server (port 3000). Its job is to render stx
 * views — nothing else. It is NOT a place to implement API endpoints.
 * Application logic lives in:
 *
 *     routes/api.ts          → declares the route + middleware
 *     app/Actions/*.ts       → handles the request, talks to ORM/mailer
 *
 * The API itself listens on port 4008 (`./buddy dev:api` / the
 * `bun --watch storage/framework/core/actions/src/dev/api.ts` process).
 *
 * The only thing this file does for `/api/**` (and any non-GET verb) is
 * forward the request to the API server, then stream the response back.
 * Don't re-implement endpoints here — every endpoint we add inline
 * here (`onRequest` answering with its own DB write, its own JSON
 * shape, etc.) silently bypasses the entire routes → actions stack:
 *
 *   - the Stacks router never sees the request
 *   - middleware on the route (auth, rateLimit, csrf) never runs
 *   - the Action override in `app/Actions/` never runs, so its DB
 *     writes, dispatched events, and mailer calls don't happen
 *   - logs in `[SubscriberEmailAction]` etc. go silent
 *
 * If a new endpoint is needed, declare it in `routes/api.ts` and put
 * the handler in `app/Actions/`. Leave this file alone.
 */
const API_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function onRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const isApiMethod = API_METHODS.has(req.method)
  const isApiPath = url.pathname.startsWith('/api/')
  if (!isApiMethod && !isApiPath)
    return null

  const upstreamUrl = `${API_ORIGIN}${url.pathname}${url.search}`
  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }
  if (req.method !== 'GET' && req.method !== 'HEAD')
    init.body = await req.arrayBuffer()

  try {
    const upstream = await fetch(upstreamUrl, init)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  }
  catch (err) {
    console.error(`[serve] proxy to ${upstreamUrl} failed:`, err)
    return new Response(
      JSON.stringify({ error: 'API server unreachable. Make sure `./buddy dev:api` is running.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

// eslint-disable-next-line ts/no-top-level-await
await serve({
  patterns: ['resources/views/'],
  port: PORT,
  layoutsDir: 'resources/layouts',
  partialsDir: 'resources/components',
  onRequest,
})
