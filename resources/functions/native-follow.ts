import { ApiError } from './native-api'
import { authFetch } from './native-session'

/**
 * Following a judge, from the phone (bench-review#79).
 *
 * The endpoints shipped with the web app and the native half reached none of
 * them, while the native copy promised otherwise in two places:
 * `Login.stx` and `Profile.stx` both say an account is what you need "to
 * write a review, follow a judge, or manage your profile". Of those three the
 * phone could do two.
 *
 * Shaped like `native-reactions.ts` on purpose, down to the rollback
 * contract, because it is the same kind of thing: an optimistic toggle
 * against an idempotent endpoint. The screens are left with layout.
 */

/**
 * The judge ids the signed-in person follows.
 *
 * `GET /api/me/follows` answers a bare array of ids rather than judge rows —
 * enough to light up a button without paying for a join. This normalises it
 * because a list that quietly contains `'7'` instead of `7` makes an
 * `includes` check fail on the one judge it was asked about.
 *
 * An empty array on failure, NOT a throw: the caller is a public screen whose
 * other half loads fine without a session, and a follow state that could not
 * be read is indistinguishable to it from one that is false. The cost of
 * being wrong is one label reading "Follow" for a judge already followed, and
 * the first tap corrects it — `POST` is idempotent and answers with the truth.
 *
 * Only call this with a session. Without one it is a guaranteed 401, and
 * `authFetch` treats a 401 as a spent token: it would clear the Keychain of
 * whoever had just signed in (see the fixture note in mobile-e2e-api.ts, which
 * is the bug this sentence exists to prevent a second time).
 */
export async function fetchFollowedIds(): Promise<number[]> {
  try {
    const response = await authFetch('/api/me/follows')
    if (!response.ok)
      return []
    const body = await response.json().catch(() => []) as unknown
    if (!Array.isArray(body))
      return []
    return body
      .map(value => Number(value))
      .filter(id => Number.isInteger(id) && id > 0)
  }
  catch {
    return []
  }
}

/** What the button says. */
export function followLabel(following: boolean): string {
  return following ? 'Following' : 'Follow'
}

/**
 * What VoiceOver reads for the button.
 *
 * A label has to say what a tap DOES, not what the state is — the state
 * belongs in `accessibilityState`, and a button announced as "Following"
 * alone gives no clue that tapping it stops. Named, too: a bare "Follow" in
 * the middle of a judge's screen is the one control whose object a screen
 * reader cannot infer from the surrounding layout.
 */
export function followAccessibilityLabel(following: boolean, judge: string): string {
  const who = String(judge || '').trim() || 'this judge'
  return following ? `Following ${who}. Tap to stop following.` : `Follow ${who}`
}

/** Why a follow was refused, worded for the person who tapped. */
export function followFailureMessage(status: number, body: Record<string, any>): string {
  const fromServer = String(body?.error || body?.message || '').trim()
  if (fromServer)
    return fromServer
  if (status === 401)
    return 'Sign in to follow judges.'
  if (status === 404)
    return 'That judge is no longer listed.'
  // The route is throttled at 60 writes a minute, and a follow button is
  // exactly the control someone taps repeatedly. "Try again" would be a lie
  // for the next few seconds, so this says what to do instead.
  if (status === 429)
    return 'That was a lot of taps. Wait a moment and try again.'
  if (status === 0)
    return 'Could not reach Bench Review. Your follow was not saved.'
  return 'That did not save. Please try again.'
}

/** What the button should show after a toggle, and why if it did not take. */
export interface FollowOutcome {
  /** The server's answer, or the value from before when it refused. */
  value: boolean
  /** Set only on failure; already worded for the person who tapped. */
  error?: string
}

/**
 * Send the toggle and say what the button should show.
 *
 * Takes the state from BEFORE the tap and infers the verb, so a caller cannot
 * send a `POST` while showing "Following". `POST` is idempotent on
 * `(user_id, judge_id)` and `DELETE` on a missing row is a no-op, so a
 * double-fire is harmless at the storage layer; the screen still guards it,
 * because two requests in flight can land out of order.
 *
 * On failure it hands BACK the value from before, so a caller that always
 * applies `value` rolls back by construction rather than by remembering to —
 * the same contract as `sendLike`.
 */
export async function sendFollow(judgeId: number, before: boolean): Promise<FollowOutcome> {
  try {
    const response = await authFetch(`/api/judges/${judgeId}/follow`, {
      method: before ? 'DELETE' : 'POST',
    })
    const body = await response.json().catch(() => ({})) as Record<string, any>
    if (!response.ok)
      return { value: before, error: followFailureMessage(response.status, body) }

    // The server states the resulting state and is the authority on it:
    // another device may have changed it since this screen loaded. Both
    // actions answer `following`, so its absence means an older build, and
    // the intended value is the better guess than the old one — otherwise a
    // successful follow would leave the button saying "Follow".
    return { value: typeof body?.following === 'boolean' ? body.following : !before }
  }
  catch (err) {
    return { value: before, error: followFailureMessage(err instanceof ApiError ? err.status : 0, {}) }
  }
}
