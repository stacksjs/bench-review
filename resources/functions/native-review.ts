/**
 * Turning what someone types on a phone into what the server stores
 * (bench-review#79).
 *
 * The web review form is a rich-text editor and POSTs HTML; `POST /api/reviews`
 * sanitises it against a tag whitelist (`app/Helpers/sanitizeReviewHtml.ts`)
 * and the article view renders it as markup. A native `TextInput` gives plain
 * text, so something has to bridge the two — and the naive bridge, sending the
 * raw string, is wrong in a way that only shows up after the review is
 * published: the text survives sanitisation as a single text node, so every
 * paragraph break the author typed is gone and the review renders as one wall.
 *
 * So: escape first, then wrap each blank-line-separated block in `<p>`, which
 * is on the whitelist. Escaping before wrapping is what makes this safe — a
 * review that mentions `<script>` stays a review that mentions it.
 */

/** HTML-escape. Ampersand first, or the escapes get escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Plain text to the review body's HTML.
 *
 * Blank lines separate paragraphs; a single newline inside one becomes `<br>`,
 * which is how a phone keyboard's return key is normally meant. Returns an
 * empty string for empty input rather than `<p></p>`, so an empty body stays
 * detectably empty — the server measures VISIBLE text precisely because
 * wrapper markup once sailed past a length check.
 */
export function toReviewHtml(text: string): string {
  const normalised = String(text ?? '').replace(/\r\n?/g, '\n').trim()
  if (!normalised)
    return ''
  return normalised
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * The length the server will measure, computed on the text the author can see.
 *
 * `SubmitReviewAction` strips tags and collapses whitespace before applying its
 * 10-character floor. Escaping only ever makes a string longer, so measuring
 * the raw text here can reject something the server would accept but never
 * accepts something the server would reject — which is the direction a
 * client-side check has to err in.
 */
export function visibleLength(text: string): number {
  return String(text ?? '').replace(/\s+/g, ' ').trim().length
}

/** Mirrors `SubmitReviewAction`'s declarative rules, so the phone says it first. */
export const TITLE_MIN = 3
export const TITLE_MAX = 255
export const CONTENT_MIN = 10
export const CONTENT_MAX = 10000

/**
 * Why this review cannot be sent yet, or null when it can.
 *
 * One message at a time, in the order the form reads, so the person is told
 * about the first thing to fix rather than everything at once.
 */
export function reviewProblem(input: { judgeId: number, rating: number, title: string, body: string }): string | null {
  if (!input.judgeId)
    return 'Choose the judge this review is about.'
  if (input.rating < 1 || input.rating > 5)
    return 'Give a rating from 1 to 5 stars.'
  const title = String(input.title ?? '').trim()
  if (title.length < TITLE_MIN)
    return `A title needs at least ${TITLE_MIN} characters.`
  if (title.length > TITLE_MAX)
    return `A title can be at most ${TITLE_MAX} characters.`
  const length = visibleLength(input.body)
  if (length < CONTENT_MIN)
    return `Write at least ${CONTENT_MIN} characters about your experience.`
  if (length > CONTENT_MAX)
    return `A review can be at most ${CONTENT_MAX} characters.`
  return null
}

/**
 * What to tell someone when the server refuses the review.
 *
 * Each of these is a real answer from `POST /api/reviews` with a consequence
 * the author has to act on, and collapsing them into "something went wrong"
 * would leave them retrying a thing that cannot succeed: an unverified
 * account needs the inbox, a second review of the same judge needs the
 * existing one edited instead.
 */
export function submitFailureMessage(status: number, body: Record<string, any>): string {
  const fromServer = String(body?.error || body?.message || '').trim()
  if (fromServer)
    return fromServer
  if (status === 401)
    return 'Your session has expired. Sign in again to post this review.'
  if (status === 403)
    return 'Verify your email address before posting a review — check your inbox for the link.'
  if (status === 404)
    return 'That judge is no longer listed.'
  if (status === 409)
    return 'You have already reviewed this judge. Edit your existing review instead.'
  if (status === 422)
    return 'Some of this review needs changing before it can be posted.'
  return 'The review could not be posted. Please try again.'
}
