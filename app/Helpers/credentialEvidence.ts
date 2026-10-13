/**
 * Normalising and checking the evidence attached to a credential claim.
 *
 * Shared by the two actions that write the credential_* column group
 * (ClaimJudgeProfileAction, UpdateCredentialClaimAction) so a claim cannot
 * be recorded with evidence one path validates and the other does not.
 */

/**
 * Long enough to say something, short enough to store on the row. A judge
 * writing "I am the judge" clears neither bar - that is a decision for the
 * admin reading it, not a rule to encode here. The floor only rules out the
 * empty gesture.
 */
export const MIN_EVIDENCE_LENGTH = 20
export const MAX_EVIDENCE_LENGTH = 2000
export const MAX_EVIDENCE_URL_LENGTH = 600

export function normalizeEvidence(value: unknown): string {
  return String(value ?? '').trim().slice(0, MAX_EVIDENCE_LENGTH)
}

/**
 * Accept an http(s) URL, or '' for "none given".
 *
 * Returns null when the input is present but unusable, so a caller can tell
 * "omitted" from "wrong" and answer 422 rather than silently dropping it -
 * an admin seeing no link cannot tell whether the claimant never gave one.
 *
 * http and https only. The queue renders this as a link for an admin to
 * click, and `javascript:` or `data:` in an admin-only surface is how a
 * claimant gets a script into the one session that can approve them.
 */
export function normalizeEvidenceUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim().slice(0, MAX_EVIDENCE_URL_LENGTH)
  if (!raw)
    return ''
  let parsed: URL
  try {
    parsed = new URL(raw)
  }
  catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return null
  return parsed.toString().slice(0, MAX_EVIDENCE_URL_LENGTH)
}
