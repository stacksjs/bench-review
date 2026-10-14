/**
 * Admin-side masking for authors who asked to be anonymous (bench-review#56).
 *
 * This site publishes criticism of named, sitting judges. The thing that makes
 * that safe to write is the anonymity promise, and the admin panel was the one
 * place that promise did not hold: `ReviewIndexAction` returned
 * `user: { id, name, email }` on EVERY row, anonymized or not, behind a single
 * password with no second factor. One compromised moderator account
 * de-anonymized every anonymous reviewer on the site at once, silently.
 *
 * So the queue now sees a masked author by default and has to ask — per row,
 * with a reason — to see who wrote it. The ask is recorded in
 * `moderation_logs`, which means an unmasking leaves a trace even when the
 * person doing it is legitimately signed in.
 *
 * ── Why there is still a per-author handle ──────────────────────────────────
 * A moderator's real question is usually not "who is this" but "is this the
 * same person again". Nulling the id outright would have taken that away and
 * pushed them to reveal every time, which would make the reveal log noise and
 * the control useless.
 *
 * `author_ref` answers it without identity: a keyed digest of the user id,
 * stable for one author across every row they wrote. Three anonymous reviews
 * carrying `A-7f3c91` are visibly one person; nothing about that string says
 * who the person is.
 *
 * It MUST be keyed (HMAC), not a plain hash. User ids are small sequential
 * integers, so `sha256(user_id)` is reversible by hashing 1..n and comparing —
 * a "mask" anyone could undo offline. The HMAC key is APP_KEY, which also
 * means rotating APP_KEY rotates every ref: that is deliberate, since the ref
 * is a moderation convenience and not an identifier anything should persist.
 */

import { createHmac } from 'node:crypto'
import { config } from '@stacksjs/config'

export interface AdminAuthor {
  /** Real user id, or null when the author asked to be anonymous. */
  id: number | null
  /** Real name, or a generic label when anonymized. */
  name: string
  /** Real email, or null when anonymized. */
  email: string | null
  /** True when this author's identity is masked and behind the reveal control. */
  anonymized: boolean
  /**
   * Stable per-author pseudonym, present only on masked rows. Equal across
   * every review/comment by the same author; carries no identity.
   */
  author_ref?: string
}

export function isAnonymized(row: { anonymized?: boolean | number | null }): boolean {
  return Boolean(row.anonymized && Number(row.anonymized) !== 0)
}

/**
 * Keyed, truncated digest of a user id. 12 hex characters — short enough to
 * read off a table at a glance, wide enough that two authors colliding is not
 * a thing that happens at this site's scale.
 */
export function authorRef(userId: number): string {
  // An empty key would make the HMAC a plain hash and the ref reversible, so
  // fall back to a constant that is at least not the empty string. A missing
  // APP_KEY is a misconfiguration the rest of the framework already shouts
  // about (sessions and signed URLs need it too).
  const key = String((config as any)?.app?.key || 'bench-anonymity-mask')
  const digest = createHmac('sha256', key).update(`author:${userId}`).digest('hex')
  return `A-${digest.slice(0, 12)}`
}

/**
 * Build the author object an admin surface may return for a row.
 *
 * `null` in, `null` out: a row with no user at all (seeded factory rows,
 * or an author whose account was deleted) has no author to mask.
 */
export function maskAuthor(
  row: { anonymized?: boolean | number | null, user_id?: number | null },
  user: { id?: number | null, name?: string | null, email?: string | null } | null | undefined,
): AdminAuthor | null {
  if (!user || user.id == null)
    return null

  if (!isAnonymized(row)) {
    return {
      id: Number(user.id),
      name: user.name || 'Reviewer',
      email: user.email ?? null,
      anonymized: false,
    }
  }

  return {
    id: null,
    name: 'Anonymous',
    email: null,
    anonymized: true,
    author_ref: authorRef(Number(user.id)),
  }
}
