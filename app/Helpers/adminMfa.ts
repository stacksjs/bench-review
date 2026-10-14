/**
 * Email second factor for admin login (bench-review#56).
 *
 * The admin panel is where someone can see which real person wrote an
 * anonymous review of a named judge. Before this, an email and a password
 * reached it — so the anonymity of every reviewer on the site rested on one
 * password not having been reused anywhere else.
 *
 * The flow is two requests:
 *
 *   1. `AdminLoginAction` verifies the password and the admin role, then calls
 *      `issueAdminLoginCode`. No token is issued. The response carries an
 *      opaque `challenge` and a masked destination.
 *   2. `AdminMfaVerifyAction` calls `verifyAdminLoginCode` with the challenge
 *      and the 6 digits from the email, and only then mints a session.
 *
 * ── Why email and not TOTP ──────────────────────────────────────────────────
 * The framework already ships TOTP (`@stacksjs/auth`'s two-factor module) and
 * it is the stronger factor. It also requires every admin to enrol first, and
 * a required factor nobody has enrolled in is an admin panel nobody can log
 * into. Email needs no enrolment because every admin already has a verified
 * address. TOTP is the upgrade path, not a competing design: when enrolment
 * exists, `verifyTwoFactorLoginCode` replaces the code check here and the rest
 * of the flow is unchanged.
 */

import { randomBytes, randomInt } from 'node:crypto'
import { config } from '@stacksjs/config'
import { db } from '@stacksjs/database'
import { makeHash, verifyHash } from '@stacksjs/security'

/** How long a code is good for. Long enough to find the email, short enough that a leaked inbox later is useless. */
export const ADMIN_MFA_TTL_SECONDS = 10 * 60

/**
 * Wrong guesses a challenge survives. Six digits is a 1-in-1,000,000 guess, so
 * five attempts is a 1-in-200,000 chance per challenge — and a burned
 * challenge means starting over with the password, which is throttled.
 */
export const ADMIN_MFA_MAX_ATTEMPTS = 5

export interface IssuedCode {
  challenge: string
  /** The plaintext code. Emailed, never stored, never returned to the client. */
  code: string
  expiresAt: string
}

export type VerifyFailure =
  | 'not_found'
  | 'expired'
  | 'used'
  | 'locked'
  | 'wrong_code'

export type VerifyResult =
  | { ok: true, userId: number }
  | { ok: false, reason: VerifyFailure }

/** Six digits, uniformly drawn. `randomInt` avoids the modulo bias of `randomBytes % 1e6`. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * `d***a@example.com` — enough for the admin to recognise which inbox to
 * check, not enough to be a disclosure if the response is seen by someone
 * who only had the password.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1)
    return '(hidden)'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2)
    return `${local[0]}***${domain}`
  return `${local[0]}***${local[local.length - 1]}${domain}`
}

/**
 * Issue a fresh code for a user, invalidating any earlier one.
 *
 * Delete-then-insert rather than reuse: if two login attempts are in flight,
 * only the newest email should work. Leaving the old row alive would mean an
 * attacker who triggered a login an hour ago still has a valid code sitting in
 * the table.
 */
export async function issueAdminLoginCode(userId: number): Promise<IssuedCode> {
  const challenge = randomBytes(32).toString('hex')
  const code = generateCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ADMIN_MFA_TTL_SECONDS * 1000).toISOString()

  await db.deleteFrom('admin_login_codes').where('user_id', '=', userId).execute()
  await db.insertInto('admin_login_codes').values({
    challenge,
    user_id: userId,
    code_hash: await makeHash(code, { algorithm: 'bcrypt' }),
    attempts: 0,
    expires_at: expiresAt,
    consumed_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  } as any).execute()

  return { challenge, code, expiresAt }
}

/**
 * Check a code against a challenge and consume it on success.
 *
 * Every failure mode is distinguishable HERE, because the caller needs to tell
 * "your code expired, request another" from "that is the wrong code" — the
 * admin is already authenticated by password at this point, so there is no
 * enumeration to protect against and a vague error just wastes their time.
 */
export async function verifyAdminLoginCode(challenge: string, code: string): Promise<VerifyResult> {
  const row = await db.selectFrom('admin_login_codes')
    .select(['id', 'user_id', 'code_hash', 'attempts', 'expires_at', 'consumed_at'])
    .where('challenge', '=', challenge)
    .executeTakeFirst() as {
      id: number
      user_id: number
      code_hash: string
      attempts: number
      expires_at: string
      consumed_at: string | null
    } | undefined

  if (!row)
    return { ok: false, reason: 'not_found' }

  if (row.consumed_at)
    return { ok: false, reason: 'used' }

  if (Number(row.attempts) >= ADMIN_MFA_MAX_ATTEMPTS)
    return { ok: false, reason: 'locked' }

  if (new Date(row.expires_at).getTime() <= Date.now())
    return { ok: false, reason: 'expired' }

  const matches = await verifyHash(code, row.code_hash).catch(() => false)
  if (!matches) {
    // Count the attempt BEFORE returning, so a client that hangs up mid-request
    // still paid for the guess.
    await db.updateTable('admin_login_codes')
      .set({ attempts: Number(row.attempts) + 1, updated_at: new Date().toISOString() } as any)
      .where('id', '=', row.id)
      .execute()
    return { ok: false, reason: 'wrong_code' }
  }

  // Consume on success so a correct code cannot be replayed — e.g. from an
  // email that is later forwarded, or a browser history entry.
  await db.updateTable('admin_login_codes')
    .set({ consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
    .where('id', '=', row.id)
    .execute()

  return { ok: true, userId: Number(row.user_id) }
}

/**
 * True when it is safe to print a login code to the server log.
 *
 * Local development has no SMTP in most setups, and an admin panel that cannot
 * be logged into locally is an admin panel that stops being tested. Production
 * must never take this path — a code in a log file is a code in whatever
 * aggregates that log file — so this is a positive allowlist of environments
 * rather than a `!== 'production'` check, which would silently open up on any
 * env name nobody remembered to consider.
 */
export function mayLogCodeToConsole(): boolean {
  const env = String((config as any)?.app?.env ?? 'local').toLowerCase()
  return env === 'local' || env === 'development' || env === 'dev' || env === 'test' || env === 'testing'
}
