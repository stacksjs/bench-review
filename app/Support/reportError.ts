import process from 'node:process'
import { log } from '@stacksjs/logging'

/**
 * One place a production failure goes (bench-review#55).
 *
 * Before this, every failure the app deliberately swallowed — a mail send that
 * did not deliver, an audit write that lost a race — went to `console.warn`.
 * Under the production serve that output goes nowhere: it is not in
 * `storage/logs`, there is no aggregator, and nobody is watching a terminal.
 * So the failures the code was most careful to survive were exactly the ones
 * nobody could discover had happened.
 *
 * ── Why the error is flattened by hand ──────────────────────────────────────
 * `log.error('...', { err })` serialises an Error to `{}` — an Error's
 * `message` and `stack` are non-enumerable, so anything that JSON-stringifies
 * the context drops them (stacksjs/stacks#1956). Passing the Error object
 * straight through produces a log line that says something failed and nothing
 * about what. So `message` and `stack` are pulled onto plain fields first.
 *
 * ── Delivery ────────────────────────────────────────────────────────────────
 * Always to the log. Additionally to `ERROR_WEBHOOK_URL` when one is set,
 * which is enough to put a message in a Slack/Discord channel without adopting
 * an SDK; a Sentry DSN can replace that later behind this same function.
 *
 * This NEVER throws and never rejects. It is called from catch blocks whose
 * whole purpose is to let the request survive, and a reporter that can fail
 * the thing it is reporting on is worse than no reporter.
 */

export interface ErrorContext {
  [key: string]: unknown
}

/** Shape sent to the webhook, and the shape logged. */
function flatten(context: string, err: unknown, meta?: ErrorContext): Record<string, unknown> {
  const base: Record<string, unknown> = {
    context,
    app: process.env.APP_NAME || 'bench-review',
    env: process.env.APP_ENV || 'local',
    at: new Date().toISOString(),
  }
  if (err instanceof Error) {
    base.message = err.message
    base.name = err.name
    // Trimmed: a full stack in a chat webhook is unreadable, and the first
    // few frames are the ones that identify the site of the failure.
    base.stack = (err.stack || '').split('\n').slice(0, 6).join('\n')
  }
  else {
    base.message = String(err)
  }
  if (meta) {
    for (const [k, v] of Object.entries(meta))
      base[k] = v
  }
  return base
}

/**
 * Report a failure the request survived.
 *
 * `context` is a short stable tag — 'mail.review-status', 'backup.daily' — so
 * the same failure is greppable across occurrences.
 */
export function reportError(context: string, err: unknown, meta?: ErrorContext): void {
  const payload = flatten(context, err, meta)

  try {
    log.error(`[${context}] ${payload.message}`, payload)
  }
  catch {
    // Logging itself is down. There is nowhere left to say so.
  }

  const hook = process.env.ERROR_WEBHOOK_URL
  if (!hook)
    return

  // Fire-and-forget with a short timeout. An alerting endpoint that hangs must
  // not hold a request open, and a failed alert is not worth an exception.
  try {
    const body = JSON.stringify({
      text: `[${payload.env}] ${context}: ${payload.message}`,
      ...payload,
    })
    void fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }
  catch {
    // Malformed URL, serialisation failure — nothing here is worth raising.
  }
}
