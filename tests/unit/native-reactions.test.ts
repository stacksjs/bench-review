import { afterEach, describe, expect, test } from 'bun:test'
import {
  COMMENT_MAX,
  commentByline,
  commentFailureMessage,
  commentLabel,
  commentProblem,
  helpfulLabel,
  likeFailureMessage,
  nextLikeState,
  sendLike,
} from '../../resources/functions/native-reactions'

/**
 * Liking and commenting from the phone — bench-review#44, bench-review#79.
 *
 * These are the parts of the feed's new action row that can be checked
 * without a simulator: what the counters say, what a refusal says, and what
 * an optimistic toggle does to a count before the server answers.
 */

describe('an optimistic like', () => {
  test('a toggle moves the count in the direction of the toggle', () => {
    expect(nextLikeState({ liked: false, likes: 4 })).toEqual({ liked: true, likes: 5 })
    expect(nextLikeState({ liked: true, likes: 5 })).toEqual({ liked: false, likes: 4 })
  })

  test('the count cannot go below zero', () => {
    // A row arriving as liked with a count of 0 is inconsistent server state.
    // Subtracting anyway would show "-1" to the one person who hit it, which
    // is a worse answer than refusing to go lower.
    expect(nextLikeState({ liked: true, likes: 0 })).toEqual({ liked: false, likes: 0 })
  })

  test('a missing count is treated as none, not as NaN', () => {
    expect(nextLikeState({ liked: false, likes: undefined as any })).toEqual({ liked: true, likes: 1 })
  })

  test('it is reversible, which is what makes a rollback possible', () => {
    // The screen puts the previous value back when the request fails, so the
    // guess has to be exactly undoable.
    const before = { liked: false, likes: 9 }
    expect(nextLikeState(nextLikeState(before))).toEqual(before)
  })
})

describe('what the buttons say', () => {
  test('zero shows the verb rather than the number', () => {
    // A bare "0" counts a thing that has not happened, on every untouched
    // row. The verb is also the clearer invitation to tap.
    expect(helpfulLabel(0)).toBe('Helpful')
    expect(commentLabel(0)).toBe('Comment')
  })

  test('any count shows the count', () => {
    expect(helpfulLabel(1)).toBe('1')
    expect(helpfulLabel(23)).toBe('23')
    expect(commentLabel(4)).toBe('4')
  })

  test('absent and negative are treated as zero', () => {
    expect(helpfulLabel(null as any)).toBe('Helpful')
    expect(commentLabel(undefined as any)).toBe('Comment')
    expect(helpfulLabel(-2)).toBe('Helpful')
  })
})

describe('why a like was refused', () => {
  test("the server's own wording wins when it sent one", () => {
    // LikeReviewAction says this better than a status code can be translated.
    expect(likeFailureMessage(422, { error: 'You cannot mark your own review as helpful.' }))
      .toBe('You cannot mark your own review as helpful.')
  })

  test('each status says a different thing', () => {
    const messages = [401, 404, 422, 429, 0, 500].map(s => likeFailureMessage(s, {}))
    expect(new Set(messages).size).toBe(messages.length)
    expect(likeFailureMessage(401, {})).toMatch(/sign in/i)
    // Unreachable is about the connection, not about the review.
    expect(likeFailureMessage(0, {})).toMatch(/could not reach/i)
  })

  test('a throttle is not the generic "try again"', () => {
    // The route allows 60 writes a minute and these are chips in a scrolling
    // list, so hitting it takes no effort at all. Falling through to "Please
    // try again" told people to do the one thing that could not work yet.
    expect(likeFailureMessage(429, {})).toMatch(/wait a moment/i)
    expect(likeFailureMessage(429, {})).not.toBe(likeFailureMessage(500, {}))
  })
})

describe('a comment before it is sent', () => {
  test('the bounds match what the server enforces', () => {
    expect(commentProblem('hi')).toMatch(/at least 5/)
    expect(commentProblem('a'.repeat(COMMENT_MAX + 1))).toMatch(/at most/)
    expect(commentProblem('This is long enough.')).toBeNull()
  })

  test('whitespace is not length', () => {
    // Otherwise a box of spaces posts, and the server refuses something the
    // person was told was fine.
    expect(commentProblem('    ')).toMatch(/at least 5/)
    expect(commentProblem('  hello  ')).toBeNull()
  })

  test('the over-length message says how long it actually is', () => {
    const problem = commentProblem('a'.repeat(COMMENT_MAX + 7))
    expect(problem).toContain(String(COMMENT_MAX + 7))
  })
})

describe('why a comment was refused', () => {
  test('an unverified email is distinguishable from an expired session', () => {
    // They need different things done about them, so they cannot share a
    // sentence.
    expect(commentFailureMessage(403, {})).toMatch(/verify/i)
    expect(commentFailureMessage(401, {})).toMatch(/session/i)
  })

  test('a throttle says the draft is kept, because it is', () => {
    // Twenty in five minutes is a long wait to be told "try again" about,
    // and the composer does not clear on failure — so the message says so
    // rather than leaving someone retyping it.
    expect(commentFailureMessage(429, {})).toMatch(/draft is kept/i)
    expect(commentFailureMessage(429, {})).not.toBe(commentFailureMessage(500, {}))
  })

  test('unreachable says the comment was not posted', () => {
    // The draft is still in the box; what matters is that nobody believes it
    // went out.
    expect(commentFailureMessage(0, {})).toMatch(/not been posted/i)
  })
})

describe('a comment byline', () => {
  test('name and date, with no id reconstructed', () => {
    expect(commentByline({ name: 'Dana Clerk' }, '5 Oct 2026')).toBe('Dana Clerk · 5 Oct 2026')
  })

  test('an anonymous author still has a byline', () => {
    // `author.id` is null by construction for these; the name is all there is.
    expect(commentByline({ name: 'Anonymous attorney' }, '5 Oct 2026')).toBe('Anonymous attorney · 5 Oct 2026')
    expect(commentByline(null, '5 Oct 2026')).toBe('Anonymous · 5 Oct 2026')
  })

  test('a missing date does not leave a dangling separator', () => {
    expect(commentByline({ name: 'Dana Clerk' }, '')).toBe('Dana Clerk')
  })
})

describe('sending a like', () => {
  const asHost = (token: string | null): void => {
    ;(globalThis as any).craft = {
      app: { url: 'http://fixture.test/' },
      secureStorage: { getSync: () => token, remove: () => {} },
    }
  }
  const answer = (status: number, body: unknown): void => {
    ;(globalThis as any).fetch = async () =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    delete (globalThis as any).craft
  })

  test("the server's count wins over the guess", async () => {
    // Another device may have changed it since this page was fetched.
    asHost('t')
    answer(200, { liked: true, likes: 99 })
    expect(await sendLike(1, { liked: false, likes: 4 })).toEqual({ value: { liked: true, likes: 99 } })
  })

  test('a server that omits the count falls back to the GUESS, not the old value', async () => {
    // Falling back to `before` would show 4 beside a filled button — the one
    // state that says the tap did nothing when it did.
    asHost('t')
    answer(200, { liked: true })
    expect(await sendLike(1, { liked: false, likes: 4 })).toEqual({ value: { liked: true, likes: 5 } })
  })

  test('a refusal hands back the value from before, so applying it IS the rollback', async () => {
    asHost('t')
    answer(422, { error: 'You cannot mark your own review as helpful.' })
    const outcome = await sendLike(1, { liked: false, likes: 4 })
    expect(outcome.value).toEqual({ liked: false, likes: 4 })
    expect(outcome.error).toBe('You cannot mark your own review as helpful.')
  })

  test('an unreachable server is a rollback with the connection worded', async () => {
    asHost('t')
    ;(globalThis as any).fetch = async () => { throw new Error('offline') }
    const outcome = await sendLike(1, { liked: true, likes: 7 })
    expect(outcome.value).toEqual({ liked: true, likes: 7 })
    expect(outcome.error).toMatch(/could not reach/i)
  })
})
