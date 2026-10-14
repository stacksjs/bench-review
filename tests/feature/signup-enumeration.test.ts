import { readFileSync } from 'node:fs'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import registerAction from '../../app/Actions/Auth/RegisterAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Registration must not say whether an address already has an account —
 * bench-review#56.
 *
 * Login and password reset were already uniform, which left registration as
 * the only auth surface that answered the question "does this person have an
 * account here". On a site that publishes anonymous criticism of named,
 * sitting judges, confirming that a particular lawyer or clerk holds an
 * account is the first half of unmasking them.
 *
 * The framework closed its half upstream (stacksjs/stacks#1953): `register()`
 * now hashes the password BEFORE it looks for a duplicate, so there is no
 * timing difference, and returns a generic 422 either way unless
 * `config.auth.registration.preventEnumeration` is explicitly false. This
 * pins the APP's half: that bench does not reach around that and answer the
 * question itself.
 */

const EMAIL = 'enumeration-probe@example.test'

function reset(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM users WHERE email = ?', [EMAIL])
  raw.close()
}

function userCount(): number {
  const raw = openTestDatabase()
  const n = Number((raw.query('SELECT COUNT(*) AS c FROM users WHERE email = ?').get(EMAIL) as any).c)
  raw.close()
  return n
}

async function signUp(fields: Record<string, unknown>): Promise<{ status: number, body: any }> {
  const req = {
    url: 'http://localhost:4008/api/auth/register',
    method: 'POST',
    params: {},
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  try {
    const res: any = await runWithRequest(req as any, () => (registerAction as any).handle(req))
    const body = typeof res?.json === 'function' ? await res.json() : res
    return { status: typeof res?.status === 'number' ? res.status : 200, body }
  }
  catch (err: any) {
    // The framework signals the duplicate as a thrown HttpError; the router
    // turns it into a response in production. Read it the same way here.
    return { status: Number(err?.status ?? 500), body: { message: String(err?.message ?? err) } }
  }
}

describe('registration does not confirm whether an account exists', () => {
  beforeEach(reset)

  test('a duplicate signup does not name the address or say it is taken', async () => {
    // Seeded directly rather than by registering first: a successful
    // registration mints an OAuth token pair, and the framework's token tables
    // are not among the app migrations this scratch database is built from.
    // The duplicate path — the one that can leak — needs only the row.
    const raw = openTestDatabase()
    raw.run(
      'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
      ['Existing Person', EMAIL, '$2b$10$notarealhashnotarealhashnotarealhashnotarealhashnot'],
    )
    raw.close()
    expect(userCount()).toBe(1)

    const result = await signUp({
      name: 'Probe Person',
      email: EMAIL,
      password: 'correct-horse-battery',
      password_confirmation: 'correct-horse-battery',
      terms_accepted: true,
    })

    // Whatever comes back must not answer "does this person have an account".
    // The exact wording the app used to return is the thing guarded against.
    const text = JSON.stringify(result.body).toLowerCase()
    expect(text).not.toContain('already exists')
    expect(text).not.toContain('already have')
    expect(text).not.toContain('try signing in')
    expect(text).not.toContain('taken')
    expect(text).not.toContain('registered')
    // 409 Conflict is itself the disclosure, whatever the body says.
    expect(result.status).not.toBe(409)
    expect(result.status).toBe(422)

    // And no second account was created.
    expect(userCount()).toBe(1)
  })

  test('the refusal is worded exactly like a generic validation failure', async () => {
    const raw = openTestDatabase()
    raw.run(
      'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
      ['Existing Person', EMAIL, '$2b$10$notarealhashnotarealhashnotarealhashnotarealhashnot'],
    )
    raw.close()

    const taken = await signUp({
      name: 'Probe Person',
      email: EMAIL,
      password: 'correct-horse-battery',
      password_confirmation: 'correct-horse-battery',
      terms_accepted: true,
    })

    // Not merely "vague" — the same string a non-duplicate rejection uses, so
    // there is nothing to compare between the two cases.
    expect(String(taken.body?.message ?? '')).toBe('Registration could not be completed. Please check your details and try again.')
  })

  test('the action itself carries no duplicate-email disclosure', () => {
    // The two tests above exercise the live path, where the framework throws
    // its generic 422 before the app's own catch is ever reached — so they
    // pass whether or not the app's catch would leak. (Verified by restoring
    // the old 409 and watching them stay green.) That makes them a guard on
    // the end-to-end contract and NOT on this file, which is where the leak
    // actually lived: a `409` with 'An account with that email already
    // exists. Try signing in instead.'
    //
    // So read the source. Crude, but it is the half the behavioural tests
    // structurally cannot see, and it is the half that regressed.
    const src = readFileSync('app/Actions/Auth/RegisterAction.ts', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')

    expect(code).not.toContain('409')
    expect(code.toLowerCase()).not.toContain('already exists')
    expect(code.toLowerCase()).not.toContain('try signing in')
  })
})
