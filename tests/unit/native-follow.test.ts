import { afterEach, describe, expect, test } from 'bun:test'
import {
  fetchFollowedIds,
  followAccessibilityLabel,
  followFailureMessage,
  followLabel,
  sendFollow,
} from '../../resources/functions/native-follow'

/**
 * Following a judge from the phone — bench-review#79.
 *
 * The parts that can be checked without a simulator: what the button says,
 * what a refusal says, what the ids list tolerates, and what a toggle does to
 * the state before the server answers.
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

const answer = (status: number, body: unknown): void => {
  ;(globalThis as any).fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('what the follow button says', () => {
  test('the two states read as a state and an invitation', () => {
    expect(followLabel(false)).toBe('Follow')
    expect(followLabel(true)).toBe('Following')
  })

  test('the spoken label says what a tap does, which the visible one cannot', () => {
    // "Following" alone tells a screen reader nothing about what tapping
    // achieves; the state itself rides on accessibilityState.
    expect(followAccessibilityLabel(true, 'Judge Alder')).toBe('Following Judge Alder. Tap to stop following.')
    expect(followAccessibilityLabel(false, 'Judge Alder')).toBe('Follow Judge Alder')
  })

  test('a judge with no name still gets a sentence rather than a dangling one', () => {
    expect(followAccessibilityLabel(false, '')).toBe('Follow this judge')
    expect(followAccessibilityLabel(true, '   ')).toContain('this judge')
  })
})

describe('why a follow was refused', () => {
  test("the server's own wording wins when it sent one", () => {
    expect(followFailureMessage(404, { error: 'Judge not found' })).toBe('Judge not found')
  })

  test('each status says a different thing', () => {
    const messages = [401, 404, 429, 0, 500].map(s => followFailureMessage(s, {}))
    expect(new Set(messages).size).toBe(messages.length)
  })

  test('a throttle does not invite an immediate retry', () => {
    // The route allows 60 writes a minute and this is a button people tap
    // repeatedly, so "please try again" would be false for a few seconds.
    expect(followFailureMessage(429, {})).toMatch(/wait a moment/i)
    // And specifically not the generic fallback, which invites the retry
    // that is guaranteed to fail.
    expect(followFailureMessage(429, {})).not.toBe(followFailureMessage(500, {}))
  })

  test('unreachable is about the connection and says nothing was saved', () => {
    expect(followFailureMessage(0, {})).toMatch(/could not reach/i)
    expect(followFailureMessage(0, {})).toMatch(/not saved/i)
  })
})

describe('reading who is already followed', () => {
  test('the ids come back as numbers whatever the server sent', async () => {
    // A list holding '7' instead of 7 makes the includes() check on the one
    // judge this screen is about silently fail.
    asHost('t')
    answer(200, ['7', 12, 3])
    expect(await fetchFollowedIds()).toEqual([7, 12, 3])
  })

  test('junk entries are dropped rather than becoming NaN in the list', async () => {
    asHost('t')
    answer(200, [1, null, 'nope', 0, -4, 2.5, 9])
    expect(await fetchFollowedIds()).toEqual([1, 9])
  })

  test('a refusal is an empty list, not a throw', async () => {
    // The caller is a public screen; the judge and the reviews have to load
    // whatever happened to the session.
    asHost('t')
    answer(401, { error: 'Unauthenticated' })
    expect(await fetchFollowedIds()).toEqual([])
  })

  test('a body that is not a list at all is an empty list', async () => {
    asHost('t')
    answer(200, { data: [1, 2] })
    expect(await fetchFollowedIds()).toEqual([])
  })

  test('an unreachable server is an empty list, not a throw', async () => {
    asHost('t')
    ;(globalThis as any).fetch = async () => { throw new Error('offline') }
    expect(await fetchFollowedIds()).toEqual([])
  })
})

describe('sending a follow', () => {
  test('the verb follows from the state before the tap', async () => {
    asHost('t')
    const seen: string[] = []
    ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      seen.push(String(init.method))
      return new Response(JSON.stringify({ ok: true, following: true }), { status: 200 })
    }
    await sendFollow(5, false)
    await sendFollow(5, true)
    // A caller cannot POST while the button reads "Following": the module
    // derives the verb rather than taking one.
    expect(seen).toEqual(['POST', 'DELETE'])
  })

  test("the server's answer wins over the intent", async () => {
    // Another device may have changed it since this screen loaded.
    asHost('t')
    answer(200, { ok: true, following: false })
    expect(await sendFollow(5, false)).toEqual({ value: false })
  })

  test('a server that omits the state falls back to the INTENT, not the old value', async () => {
    // Falling back to `before` would leave the button saying "Follow" after a
    // follow that worked — the one state that says the tap did nothing.
    asHost('t')
    answer(200, { ok: true })
    expect(await sendFollow(5, false)).toEqual({ value: true })
    expect(await sendFollow(5, true)).toEqual({ value: false })
  })

  test('a refusal hands back the value from before, so applying it IS the rollback', async () => {
    asHost('t')
    answer(404, { error: 'Judge not found' })
    const outcome = await sendFollow(5, false)
    expect(outcome.value).toBe(false)
    expect(outcome.error).toBe('Judge not found')
  })

  test('an unreachable server is a rollback with the connection worded', async () => {
    asHost('t')
    ;(globalThis as any).fetch = async () => { throw new Error('offline') }
    const outcome = await sendFollow(5, true)
    expect(outcome.value).toBe(true)
    expect(outcome.error).toMatch(/could not reach/i)
  })
})
