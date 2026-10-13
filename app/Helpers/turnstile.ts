import process from 'node:process'

/**
 * Cloudflare Turnstile verification for the signup form (bench-review#51).
 *
 * Registration had an IP throttle and nothing else — `throttle:5,10m` in
 * routes/api.ts — so scripted signups were a matter of rotating addresses.
 * On a site that publishes reviews of named, sitting judges, cheap verified
 * accounts are the raw material for harassment and impersonation.
 *
 * Turnstile was chosen over hCaptcha/reCAPTCHA; the only app-side cost is
 * this file, the widget on the form, and the `challenges.cloudflare.com`
 * entry in the built pages' script-src.
 */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * How long to wait on Cloudflare before giving up. A signup form that hangs
 * is a signup form nobody completes, and the failure is retryable.
 */
const VERIFY_TIMEOUT_MS = 5000

export type TurnstileFailure = 'not-configured' | 'missing-token' | 'rejected' | 'unreachable'

export interface TurnstileOutcome {
  ok: boolean
  reason?: TurnstileFailure
  /** Cloudflare's own codes, when it answered. For logs, never for the user. */
  codes?: string[]
}

export function turnstileSecret(): string {
  return (process.env.TURNSTILE_SECRET_KEY ?? '').trim()
}

export function turnstileSiteKey(): string {
  return (process.env.TURNSTILE_SITE_KEY ?? '').trim()
}

/**
 * Whether verification is active at all.
 *
 * Keyed on the SECRET, not the site key: the secret is what makes a server
 * check possible, and a site key alone would put a widget on the page that
 * nothing validates — worse than no widget, because it looks like a control.
 */
export function turnstileConfigured(): boolean {
  return turnstileSecret().length > 0
}

/**
 * Verify a widget token with Cloudflare.
 *
 * Fails CLOSED on both a negative verdict and an unreachable endpoint. Failing
 * open on error would be the obvious kindness, and it is wrong here: the whole
 * value of the check is that it cannot be skipped, and "Cloudflare is
 * unreachable" is a state an operator can see and fix, whereas a quiet
 * fallthrough is one nobody ever notices. The caller turns `unreachable` into
 * a retry message rather than a rejection, so a genuine outage costs a
 * person one more attempt, not an explanation that they are a robot.
 *
 * Not configured is the one case that passes: a developer running locally has
 * no keys, and registration has to work there. That is why
 * `turnstileConfigured()` is also asserted by the conformance gate for a
 * release build — see gate.ts — so "no keys" cannot quietly become the
 * production posture.
 *
 * `remoteip` is deliberately not sent. It is optional, and this app has no
 * trustworthy client-IP accessor — passing a spoofable header would narrow
 * Cloudflare's own signal rather than add to it.
 */
export async function verifyTurnstile(token: string): Promise<TurnstileOutcome> {
  if (!turnstileConfigured())
    return { ok: true, reason: 'not-configured' }

  const response = String(token ?? '').trim()
  if (!response)
    return { ok: false, reason: 'missing-token' }

  const body = new FormData()
  body.append('secret', turnstileSecret())
  body.append('response', response)

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => null) as { success?: boolean, 'error-codes'?: string[] } | null
    if (!data)
      return { ok: false, reason: 'unreachable' }
    if (data.success === true)
      return { ok: true }
    return { ok: false, reason: 'rejected', codes: data['error-codes'] ?? [] }
  }
  catch (err) {
    console.warn('[turnstile] siteverify unreachable:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'unreachable' }
  }
}
