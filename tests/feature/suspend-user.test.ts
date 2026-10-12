import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import suspendAction from '../../app/Actions/Admin/Users/SuspendUserAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Account suspension — bench-review#49.
 *
 * The abuse loop this closes: before suspension existed, the only response
 * to a harassing account was a hard delete, which destroyed the account's
 * content (the evidence) and freed the email for instant re-registration.
 *
 * Four properties are worth pinning, and they are the ones the issue names:
 * suspending stamps the account and records who did it, a suspended account
 * cannot log in, the row survives so the email stays taken, and an admin
 * cannot suspend themselves out of the system.
 *
 * Drives the real action through the router's request context against the
 * scratch database. Login rejection is asserted at the query LoginAction
 * makes rather than through the handler, because `User.where` is undefined
 * outside the framework's model registration — the branch and the data it
 * reads are what this can honestly cover.
 */

const ADMIN_ID = 9001
const ABUSER_ID = 9002

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [ADMIN_ID, ABUSER_ID])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [ADMIN_ID, 'Moderator', 'mod@example.test', ABUSER_ID, 'Abuser', 'abuser@example.test'],
  )
  raw.close()
}

function asAdmin(id: number = ADMIN_ID): void {
  ;(Auth as any).user = async () => ({ id })
}

async function suspend(targetId: number, action: string, reason?: string): Promise<{ status: number, body: any }> {
  const fields: Record<string, any> = { action, reason }
  const req = {
    url: `http://localhost:4008/api/admin/users/${targetId}/suspend`,
    method: 'POST',
    params: { id: String(targetId) },
    query: fields,
    get: (k: string) => fields[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (suspendAction as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

/** Exactly the lookup LoginAction performs before issuing a token. */
async function suspensionSeenByLogin(userId: number): Promise<string | null> {
  const row = await (db.selectFrom('users') as any)
    .select(['banned_at'])
    .where('id', '=', userId)
    .executeTakeFirst() as { banned_at: string | null } | undefined
  return row?.banned_at ?? null
}

describe('account suspension', () => {
  beforeEach(() => {
    seed()
    asAdmin()
  })

  test('suspending stamps the account and records a reason', async () => {
    expect(await suspensionSeenByLogin(ABUSER_ID)).toBeNull()

    const res = await suspend(ABUSER_ID, 'suspend', 'harassing a reviewer')
    expect(res.status).toBe(200)

    const stamped = await suspensionSeenByLogin(ABUSER_ID)
    expect(typeof stamped).toBe('string')

    const raw = openTestDatabase()
    const row = raw.query('SELECT banned_reason FROM users WHERE id = ?').get(ABUSER_ID) as { banned_reason: string | null }
    raw.close()
    expect(row.banned_reason).toBe('harassing a reviewer')
  })

  test('login is refused for a suspended account, and allowed otherwise', async () => {
    // LoginAction refuses when this lookup returns a value.
    expect(await suspensionSeenByLogin(ABUSER_ID)).toBeNull()

    await suspend(ABUSER_ID, 'suspend', 'spam')
    expect(await suspensionSeenByLogin(ABUSER_ID)).not.toBeNull()

    // An untouched account is unaffected — the gate is per-account, not global.
    expect(await suspensionSeenByLogin(ADMIN_ID)).toBeNull()
  })

  test('the row survives, so the email stays taken', async () => {
    await suspend(ABUSER_ID, 'suspend', 'ban evasion')

    const raw = openTestDatabase()
    const still = raw.query('SELECT email FROM users WHERE id = ?').get(ABUSER_ID) as { email: string } | null
    raw.close()

    // This is what blocks re-registration: the duplicate-email check in
    // register() still finds the row. A hard delete would have freed it.
    expect(still?.email).toBe('abuser@example.test')
  })

  test('is reversible', async () => {
    await suspend(ABUSER_ID, 'suspend', 'mistake incoming')
    expect(await suspensionSeenByLogin(ABUSER_ID)).not.toBeNull()

    const res = await suspend(ABUSER_ID, 'unsuspend')
    expect(res.status).toBe(200)
    expect(await suspensionSeenByLogin(ABUSER_ID)).toBeNull()
  })

  test('is written to the moderation log', async () => {
    await suspend(ABUSER_ID, 'suspend', 'doxxing')

    const raw = openTestDatabase()
    const entries = raw.query('SELECT actor_user_id, action, target_id FROM moderation_logs').all() as Array<Record<string, unknown>>
    raw.close()

    expect(entries.length).toBeGreaterThan(0)
    expect(Number(entries[0].actor_user_id)).toBe(ADMIN_ID)
    expect(Number(entries[0].target_id)).toBe(ABUSER_ID)
  })

  test('an admin cannot suspend themselves, and a bad action is refused', async () => {
    expect((await suspend(ADMIN_ID, 'suspend')).status).toBe(422)
    expect((await suspend(ABUSER_ID, 'delete')).status).toBe(422)
    expect((await suspend(999999, 'suspend')).status).toBe(404)
    // None of those should have stamped anything.
    expect(await suspensionSeenByLogin(ABUSER_ID)).toBeNull()
    expect(await suspensionSeenByLogin(ADMIN_ID)).toBeNull()
  })
})
