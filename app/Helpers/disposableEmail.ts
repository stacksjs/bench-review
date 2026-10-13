/**
 * Disposable-email-domain blocklist for signup (bench-review#51).
 *
 * The companion to the Turnstile check: Turnstile raises the cost of
 * AUTOMATING a signup, this raises the cost of making the resulting account
 * throwaway. Bench gates review submission on a verified email, so a
 * ten-minute inbox is exactly the gap that makes that gate decorative.
 *
 * ── Deliberately a small, static list ──────────────────────────────────
 * Comprehensive lists run to tens of thousands of domains, change weekly,
 * and are usually pulled at runtime from somewhere. A fetch on the signup
 * path is a new dependency and a new outage; a 40,000-entry vendored file is
 * a thing nobody updates and nobody reads. This is the head of the
 * distribution — the services people actually reach for — and it is honest
 * about being partial. It is a speed bump, not a wall, and the email
 * verification gate behind it is what actually holds.
 *
 * Matching covers subdomains, because most of these serve unlimited
 * throwaway hostnames under one apex (`anything.mailinator.com`).
 */

const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'anonbox.net',
  'burnermail.io',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxkitten.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.dev',
  'tempmail.plus',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'wegwerfmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
])

/** The domain part of an address, lowercased. '' when there isn't one. */
export function emailDomain(email: unknown): string {
  const value = String(email ?? '').trim().toLowerCase()
  const at = value.lastIndexOf('@')
  if (at < 0 || at === value.length - 1)
    return ''
  return value.slice(at + 1)
}

/**
 * True for a listed domain or any subdomain of one.
 *
 * Suffix matching is anchored on a dot (`.mailinator.com`, never
 * `evilmailinator.com`) so the list cannot accidentally catch an unrelated
 * domain that merely ends with the same letters.
 */
export function isDisposableEmail(email: unknown): boolean {
  const domain = emailDomain(email)
  if (!domain)
    return false
  if (DISPOSABLE_DOMAINS.has(domain))
    return true
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${blocked}`))
      return true
  }
  return false
}

/** Exposed for the test, so the list's shape is asserted rather than assumed. */
export function disposableDomainCount(): number {
  return DISPOSABLE_DOMAINS.size
}
