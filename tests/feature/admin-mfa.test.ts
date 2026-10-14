import { Auth } from '@stacksjs/auth'
import { makeHash } from '@stacksjs/security'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  ADMIN_MFA_MAX_ATTEMPTS,
  issueAdminLoginCode,
  mayLogCodeToConsole,
  maskEmail,
  verifyAdminLoginCode,
} from '../../app/Helpers/adminMfa'
import { openTestDatabase } from '../helpers/database'

/**
 * Admin second factor — bench-review#56.
 *
 * The admin panel is the surface where a moderator can see which real person
 * wrote an anonymous review of a named judge. An email and a password reached
 * it, which means the anonymity of every reviewer on the site rested on one
 * password not having been reused anywhere else.
 */

const ADMIN = 9701

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM admin_login_codes')
  raw.run('DELETE FROM users WHERE id = ?', [ADMIN])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
    [ADMIN, 'Mod', 'mfa-admin@example.test'],
  )
  raw.close()
}

function rows(): any[] {
  const raw = openTestDatabase()
  const out = raw.query('SELECT challenge, user_id, code_hash, attempts, expires_at, consumed_at FROM admin_login_codes ORDER BY id').all() as any[]
  raw.close()
  return out
}

function expire(challenge: string): void {
  const raw = openTestDatabase()
  raw.run('UPDATE admin_login_codes SET expires_at = ? WHERE challenge = ?', [new Date(Date.now() - 1000).toISOString(), challenge])
  raw.close()
}

describe('admin login second factor', () => {
  beforeEach(() => { seed(); (Auth as any).user = async () => ({ id: ADMIN }) })

  test('the code is six digits and is NOT stored in the clear', async () => {
    const issued = await issueAdminLoginCode(ADMIN)

    expect(issued.code).toMatch(/^\d{6}$/)
    const [row] = rows()
    // A six-digit secret sitting in plaintext is a six-digit secret belonging
    // to anyone who can read the database.
    expect(row.code_hash).not.toBe(issued.code)
    expect(row.code_hash.startsWith('$2')).toBe(true)
  })

  test('the right code verifies once, and never again', async () => {
    const issued = await issueAdminLoginCode(ADMIN)

    const first = await verifyAdminLoginCode(issued.challenge, issued.code)
    expect(first).toEqual({ ok: true, userId: ADMIN })

    // Replay: the same code out of a forwarded email or a browser history
    // entry must not open a second session.
    const second = await verifyAdminLoginCode(issued.challenge, issued.code)
    expect(second).toEqual({ ok: false, reason: 'used' })
  })

  test('a wrong code costs an attempt, and the challenge dies at the cap', async () => {
    const issued = await issueAdminLoginCode(ADMIN)
    const wrong = issued.code === '000000' ? '111111' : '000000'

    for (let i = 0; i < ADMIN_MFA_MAX_ATTEMPTS; i++)
      expect(await verifyAdminLoginCode(issued.challenge, wrong)).toEqual({ ok: false, reason: 'wrong_code' })

    expect(rows()[0].attempts).toBe(ADMIN_MFA_MAX_ATTEMPTS)
    // Past the cap even the CORRECT code is refused — otherwise the cap only
    // slows an attacker down rather than stopping them.
    expect(await verifyAdminLoginCode(issued.challenge, issued.code)).toEqual({ ok: false, reason: 'locked' })
  })

  test('an expired code is refused', async () => {
    const issued = await issueAdminLoginCode(ADMIN)
    expire(issued.challenge)

    expect(await verifyAdminLoginCode(issued.challenge, issued.code)).toEqual({ ok: false, reason: 'expired' })
  })

  test('issuing a second code invalidates the first', async () => {
    const first = await issueAdminLoginCode(ADMIN)
    const second = await issueAdminLoginCode(ADMIN)

    // Otherwise a login attempt from an hour ago leaves a live code in the
    // table for whoever still has that email.
    expect(rows()).toHaveLength(1)
    expect(await verifyAdminLoginCode(first.challenge, first.code)).toEqual({ ok: false, reason: 'not_found' })
    expect(await verifyAdminLoginCode(second.challenge, second.code)).toEqual({ ok: true, userId: ADMIN })
  })

  test('a challenge nobody issued is refused', async () => {
    expect(await verifyAdminLoginCode('a'.repeat(64), '123456')).toEqual({ ok: false, reason: 'not_found' })
  })

  test('the challenge handle is long, random, and not the user id', async () => {
    const a = await issueAdminLoginCode(ADMIN)
    const b = await issueAdminLoginCode(ADMIN)

    // It is the only thing tying the code request to the code submission.
    expect(a.challenge).toHaveLength(64)
    expect(a.challenge).not.toBe(b.challenge)
    expect(a.challenge).not.toContain(String(ADMIN))
  })

  test('a code cannot be accepted by a hash collision with another user', async () => {
    // Guards the lookup key: the row is found by `challenge`, so a second
    // user's identical code must not satisfy the first user's challenge.
    const raw = openTestDatabase()
    raw.run('DELETE FROM users WHERE id = ?', [ADMIN + 1])
    raw.run('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\'))', [ADMIN + 1, 'Other', 'mfa-other@example.test'])
    raw.close()

    const mine = await issueAdminLoginCode(ADMIN)
    const theirs = await issueAdminLoginCode(ADMIN + 1)

    const result = await verifyAdminLoginCode(theirs.challenge, mine.code)
    // Right code, wrong challenge — and it resolves to the OTHER user's id if
    // it resolves at all, never to mine.
    if (result.ok)
      expect(result.userId).toBe(ADMIN + 1)
    else
      expect(result.reason).toBe('wrong_code')
  })

  test('masking shows which inbox without disclosing the address', () => {
    expect(maskEmail('dana.whistle@example.test')).toBe('d***e@example.test')
    expect(maskEmail('ab@example.test')).toBe('a***@example.test')
    expect(maskEmail('not-an-email')).toBe('(hidden)')
  })

  test('codes are never logged outside a development environment', () => {
    // A code in a log file is a code in whatever aggregates that log file.
    // `mayLogCodeToConsole` is an allowlist, so an env name nobody thought
    // about must NOT open it up.
    const original = process.env.APP_ENV
    try {
      for (const env of ['production', 'prod', 'staging', 'preview', 'live', '']) {
        process.env.APP_ENV = env
        // config is read at call time, so a fresh read sees this.
        const { config } = require('@stacksjs/config')
        config.app.env = env
        expect(mayLogCodeToConsole()).toBe(false)
      }
      const { config } = require('@stacksjs/config')
      config.app.env = 'local'
      expect(mayLogCodeToConsole()).toBe(true)
    }
    finally {
      process.env.APP_ENV = original
      const { config } = require('@stacksjs/config')
      config.app.env = original ?? 'local'
    }
  })

  test('a stored hash from a different code does not verify', async () => {
    // Belt-and-braces on the bcrypt comparison itself: hand-write a row whose
    // hash is for '000000' and check that '123456' is refused.
    const issued = await issueAdminLoginCode(ADMIN)
    const raw = openTestDatabase()
    raw.run('UPDATE admin_login_codes SET code_hash = ? WHERE challenge = ?', [await makeHash('000000', { algorithm: 'bcrypt' }), issued.challenge])
    raw.close()

    expect(await verifyAdminLoginCode(issued.challenge, '123456')).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await verifyAdminLoginCode(issued.challenge, '000000')).toEqual({ ok: true, userId: ADMIN })
  })
})
