import { defineStore, state } from '@stacksjs/stx'

export interface SubscribeResult {
  ok: boolean
  /** HTTP status, or 0 when the request never reached the server. */
  status: number
  /** Raw response text on failure (parsed by the caller for a message); '' on success. */
  body: string
}

/**
 * Newsletter / coming-soon email capture. The single data path for the
 * BenchComingSoon opt-in form — components don't fetch directly, they route
 * through a store (no fetches in components). Returns a plain result the caller
 * turns into a toast; `status === 0` means a network error (never reached the
 * server) so the caller can distinguish it from a 4xx/5xx.
 */
defineStore('subscribe', () => {
  const submitting = state<boolean>(false)

  /**
   * `source` records WHERE a signup came from; the column already exists and
   * the action defaults it to 'homepage' when omitted, which is what the
   * coming-soon form still relies on. Worth passing from every new surface:
   * it is the only way to tell which placement is actually earning signups.
   */
  async function subscribe(email: string, source?: string): Promise<SubscribeResult> {
    submitting.set(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(source ? { email, source } : { email }),
      })
      const body = res.ok ? '' : await res.text().catch(() => '')
      return { ok: res.ok, status: res.status, body }
    }
    catch {
      return { ok: false, status: 0, body: '' }
    }
    finally {
      submitting.set(false)
    }
  }

  /**
   * Drop the subscriber identified by an emailed token. POST, not a link:
   * mail scanners prefetch every URL in a message, so a GET that unsubscribed
   * would drop people who never clicked. Unauthenticated — the token is the
   * authorisation — so a plain fetch rather than authFetch.
   */
  async function unsubscribe(token: string): Promise<{ ok: boolean, message?: string }> {
    try {
      const res = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        return { ok: false, message: data.error || 'We could not complete that right now.' }
      }
      return { ok: true }
    }
    catch {
      return { ok: false, message: 'Could not reach the server — please try again.' }
    }
  }

  return { submitting, subscribe, unsubscribe }
})
