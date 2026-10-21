import { afterEach, describe, expect, test } from 'bun:test'
import { getJson } from '../../resources/functions/native-api'
import { viewerHeaders } from '../../resources/functions/native-session'

/**
 * Asking a PUBLIC endpoint as the viewer (bench-review#79).
 *
 * `/api/reviews`, a judge's reviews and a comment thread read without a
 * session and all carry fields computed FROM one. Fetched anonymously those
 * fields are permanently false, which is a wrong answer that never corrects
 * itself — not a stale one that a reload fixes.
 */

const asHost = (token: string | null): void => {
  ;(globalThis as any).craft = {
    app: { url: 'http://fixture.test/' },
    secureStorage: { getSync: () => token, remove: () => {} },
  }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete (globalThis as any).craft
})

describe('the session as an optional hint', () => {
  test('a session becomes a bearer header', () => {
    asHost('tok-123')
    expect(viewerHeaders()).toEqual({ Authorization: 'Bearer tok-123' })
  })

  test('no session sends NOTHING, rather than an empty bearer', () => {
    // `Authorization: Bearer ` is not the same as no header — a server may
    // answer 401 to a malformed one where it would have served a guest.
    asHost(null)
    expect(viewerHeaders()).toEqual({})
  })

  test('an unreadable keychain is treated as no session', () => {
    ;(globalThis as any).craft = {
      app: { url: 'http://fixture.test/' },
      secureStorage: { getSync: () => { throw new Error('locked') } },
    }
    expect(viewerHeaders()).toEqual({})
  })
})

describe('getJson carrying them', () => {
  const capture = (): { headers: Record<string, string> } => {
    const seen: { headers: Record<string, string> } = { headers: {} }
    ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      seen.headers = (init.headers ?? {}) as Record<string, string>
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }
    return seen
  }

  test('the bearer rides along and Accept survives', async () => {
    asHost('tok-123')
    const seen = capture()
    await getJson('/api/reviews', undefined, viewerHeaders())
    expect(seen.headers.Authorization).toBe('Bearer tok-123')
    expect(seen.headers.Accept).toBe('application/json')
  })

  test('a call with no headers is unchanged, so every other caller is safe', async () => {
    // The parameter is optional and added last on purpose: three screens
    // needed it and a dozen other getJson calls must keep behaving exactly
    // as they did.
    asHost('tok-123')
    const seen = capture()
    await getJson('/api/judges')
    expect(seen.headers.Authorization).toBeUndefined()
    expect(seen.headers.Accept).toBe('application/json')
  })

  test('signed out, the request is indistinguishable from the old one', async () => {
    asHost(null)
    const seen = capture()
    await getJson('/api/reviews', undefined, viewerHeaders())
    expect(seen.headers).toEqual({ Accept: 'application/json' })
  })
})
