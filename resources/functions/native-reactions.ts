import { ApiError } from './native-api'
import { authFetch } from './native-session'

/**
 * Liking a review and commenting on one, from the phone (bench-review#44,
 * bench-review#79).
 *
 * Both endpoints already shipped and the native feed reached neither: it
 * carried the `likes` count in its row data and rendered it nowhere. What is
 * here is the part worth testing without a simulator — what the count says,
 * what a refusal says, and what an optimistic toggle does — so the screens
 * are left with layout and the calls themselves.
 */

/** The server's toggle answer. */
export interface LikeResult {
  liked: boolean
  likes: number
}

/**
 * Where a like lands before the server answers.
 *
 * Optimistic because the alternative is a button that does nothing for a
 * round trip, which reads as a broken button and gets tapped again. The
 * caller keeps this value, sends the request, and replaces it with the
 * server's own answer — or puts the old one back if the request fails.
 *
 * The count floors at zero. A row that arrives with `likes: 0` and
 * `liked_by_me: true` is inconsistent server state, but subtracting from it
 * anyway would show "-1 helpful" to the one person who hit it.
 */
export function nextLikeState(current: { liked: boolean, likes: number }): LikeResult {
  const liked = !current.liked
  const delta = liked ? 1 : -1
  return { liked, likes: Math.max(0, Number(current.likes ?? 0) + delta) }
}

/**
 * What the button says beside the heart.
 *
 * A bare "0" on every unreviewed row is noise — it counts a thing that has
 * not happened — so zero shows the verb instead, which is also the clearer
 * invitation to tap.
 */
export function helpfulLabel(likes: number): string {
  const n = Number(likes ?? 0)
  if (n <= 0)
    return 'Helpful'
  return String(n)
}

/** What the bubble says. Same reasoning as `helpfulLabel`. */
export function commentLabel(comments: number): string {
  const n = Number(comments ?? 0)
  if (n <= 0)
    return 'Comment'
  return String(n)
}

/** What a row should show after a toggle, and why if it did not take. */
export interface LikeOutcome {
  /** The server's answer, or the value from before when it refused. */
  value: LikeResult
  /** Set only on failure; already worded for the person who tapped. */
  error?: string
}

/**
 * Send the toggle and say what the row should show.
 *
 * Shared by the feed and the judge screen rather than written twice. They
 * show the same rows and have already drifted once — the judge screen
 * stripped tags with its own regex and printed `Smith &amp; Co` for it — and
 * an optimistic update with a rollback is more than enough logic to drift in
 * a direction nobody notices.
 *
 * The caller owns the optimistic guess and the state; this owns the request
 * and the wording. On failure it hands BACK the value from before, so a
 * caller that always applies `value` rolls back by construction rather than
 * by remembering to.
 */
export async function sendLike(reviewId: number, before: LikeResult): Promise<LikeOutcome> {
  try {
    const response = await authFetch(`/api/reviews/${reviewId}/like`, { method: 'POST' })
    const body = await response.json().catch(() => ({})) as Record<string, any>
    if (!response.ok)
      return { value: before, error: likeFailureMessage(response.status, body) }

    // The server is the authority on both — another device may have changed
    // the count since this page was fetched. Its absence falls back to the
    // guess, not to the old value, or a successful like would show the count
    // it had before it.
    return {
      value: {
        liked: Boolean(body?.liked),
        likes: Number(body?.likes ?? nextLikeState(before).likes),
      },
    }
  }
  catch (err) {
    return { value: before, error: likeFailureMessage(err instanceof ApiError ? err.status : 0, {}) }
  }
}

/**
 * Why a like was refused, worded for the person who tapped.
 *
 * The server's own wording wins when it sent one — `LikeReviewAction` already
 * says "You cannot mark your own review as helpful." better than a status
 * code can be translated.
 */
export function likeFailureMessage(status: number, body: Record<string, any>): string {
  const fromServer = String(body?.error || body?.message || '').trim()
  if (fromServer)
    return fromServer
  if (status === 401)
    return 'Sign in to mark reviews as helpful.'
  if (status === 404)
    return 'That review is no longer published.'
  if (status === 422)
    return 'You cannot mark your own review as helpful.'
  // The route is throttled at 60 writes a minute. This used to fall through
  // to "Please try again", which is wrong for the next few seconds in exactly
  // the case that produces it — a row of chips being tapped quickly.
  if (status === 429)
    return 'That was a lot of taps. Wait a moment and try again.'
  if (status === 0)
    return 'Could not reach Bench Review. Your reaction was not saved.'
  return 'That did not save. Please try again.'
}

export const COMMENT_MIN = 5
export const COMMENT_MAX = 2000

/**
 * What is wrong with a comment before it is sent, or null.
 *
 * The same two bounds `CommentSubmitAction` enforces, checked here so the
 * common mistakes cost no round trip. The server stays the authority — this
 * is a courtesy, not a gate.
 */
export function commentProblem(body: string): string | null {
  const text = String(body ?? '').trim()
  if (text.length < COMMENT_MIN)
    return `A comment needs at least ${COMMENT_MIN} characters.`
  if (text.length > COMMENT_MAX)
    return `A comment can be at most ${COMMENT_MAX} characters — this one is ${text.length}.`
  return null
}

/** Why a comment was refused, worded for the person who wrote it. */
export function commentFailureMessage(status: number, body: Record<string, any>): string {
  const fromServer = String(body?.error || body?.message || '').trim()
  if (fromServer)
    return fromServer
  if (status === 401)
    return 'Your session has expired. Sign in again to post this comment.'
  if (status === 403)
    return 'Verify your email address before commenting — check your inbox for the link.'
  if (status === 404)
    return 'That review is no longer published.'
  if (status === 422)
    return 'This comment needs changing before it can be posted.'
  // Twenty comments in five minutes, which is a far longer wait than the
  // like throttle — so this says the draft is safe rather than inviting an
  // immediate retry that would fail too.
  if (status === 429)
    return 'You have posted a lot of comments just now. Your draft is kept — try again in a few minutes.'
  if (status === 0)
    return 'Could not reach Bench Review. Your comment has not been posted.'
  return 'The comment could not be posted. Please try again.'
}

/**
 * The byline under a comment.
 *
 * `author.id` is null for an anonymous comment BY CONSTRUCTION — the endpoint
 * strips it rather than letting the client decide not to link — so this never
 * reconstructs one. Name and date only.
 */
export function commentByline(author: { name?: string | null } | null | undefined, when: string): string {
  return [author?.name || 'Anonymous', when].filter(Boolean).join(' · ')
}
