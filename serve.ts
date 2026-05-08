import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from 'bun-plugin-stx/serve'

const PORT = Number.parseInt(process.env.PORT || '3000')

// Local dev persistence for the notify-me signup form. Postgres is the
// production target (see config/database.ts) but it isn't reliably
// provisioned in dev, so we stage signups into a sqlite file under
// storage/. Mail delivery is handled by a separate process — this
// handler only persists the address so nothing is lost.
const SUBSCRIPTIONS_DB_PATH = 'storage/email-subscriptions.sqlite'
mkdirSync(dirname(SUBSCRIPTIONS_DB_PATH), { recursive: true })
const subscriptionsDb = new Database(SUBSCRIPTIONS_DB_PATH)
subscriptionsDb.run(`
  CREATE TABLE IF NOT EXISTS email_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)
const insertSubscription = subscriptionsDb.prepare(
  'INSERT INTO email_subscriptions (email) VALUES (?) ON CONFLICT(email) DO NOTHING',
)

// Cheap-and-correct enough RFC 5322-ish check. The form's
// `<input type="email" required>` already does a stricter pass on the
// client; this guards against direct API hits with garbage.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function onRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const pathname = url.pathname

  if (!pathname.startsWith('/api/'))
    return null

  if (pathname === '/api/email/subscribe' && req.method === 'POST') {
    let email: unknown
    try {
      const body = await req.json()
      email = (body as { email?: unknown }).email
    }
    catch {
      return jsonResponse({ errors: [{ field: 'body', message: 'Invalid JSON' }] }, 400)
    }

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return jsonResponse(
        { errors: [{ field: 'email', message: 'Please enter a valid email address.' }] },
        422,
      )
    }

    insertSubscription.run(email.trim().toLowerCase())
    return jsonResponse({ ok: true }, 201)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

// Use a hand-rolled JSON response factory rather than the global
// `Response.json`. In this dev setup something in the bun-router /
// bun-plugin-stx serve adapter intercepts `Response.json` calls and
// re-dispatches them through bun-router's legacy `BuiltInResponseMacros.json`,
// which then crashes with "status (0)" when the second argument is an
// init object. Constructing a Response directly bypasses that path.
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// eslint-disable-next-line ts/no-top-level-await
await serve({
  patterns: ['resources/views/'],
  port: PORT,
  layoutsDir: 'resources/layouts',
  partialsDir: 'resources/components',
  onRequest,
})
