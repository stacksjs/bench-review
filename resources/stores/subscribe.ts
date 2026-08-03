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

  async function subscribe(email: string): Promise<SubscribeResult> {
    submitting.set(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email }),
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

  return { submitting, subscribe }
})
