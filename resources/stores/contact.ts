import { defineStore, state } from '@stacksjs/stx'

export interface ContactInput {
  name: string
  email: string
  topic: string
  message: string
}

export interface ContactResult {
  ok: boolean
  /** Message to show the user when `ok` is false. */
  message?: string
}

/**
 * Contact-form submission. The single data path for /contact — components
 * don't fetch directly, they route through a store (stx-standards 6.6, and
 * bench's own no-fetches-in-components rule). Mirrors `subscribe`: one
 * action, a plain result the caller turns into a toast, and `submitting` for
 * anything that wants to show progress without owning the request.
 */
defineStore('contact', () => {
  const submitting = state<boolean>(false)

  async function send(input: ContactInput): Promise<ContactResult> {
    submitting.set(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok)
        return { ok: false, message: 'Could not send message. Please try again.' }
      return { ok: true }
    }
    catch {
      return { ok: false, message: 'Could not reach the server — please try again.' }
    }
    finally {
      submitting.set(false)
    }
  }

  return { submitting, send }
})
