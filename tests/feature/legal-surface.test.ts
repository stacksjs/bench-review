import process from 'node:process'
import { Auth } from '@stacksjs/auth'
import * as email from '@stacksjs/email'
import { runWithRequest } from '@stacksjs/router'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import contactAction from '../../app/Actions/Contact/SubmitContactAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Legal surface — bench-review#54.
 *
 * Bench invites the public to rate named, sitting judges, which is the
 * highest-defamation-risk category of UGC site. Two things here are not
 * ordinary form plumbing:
 *
 *   - `/api/contact` is the channel the site designates for "Report a review"
 *     and "Legal request", and it did not exist. A judge's counsel sending a
 *     takedown demand got a failure, and nothing recorded that they tried.
 *   - the message is STORED before it is emailed, because a legal demand that
 *     exists only as an email nobody received is the same as one never sent.
 */

const sent: Array<Record<string, any>> = []
const realSend = (email as any).mail.send

beforeEach(() => {
  sent.length = 0
  ;(email as any).mail.send = async (msg: Record<string, any>) => { sent.push(msg); return { message: 'stubbed' } }
  const raw = openTestDatabase()
  raw.run('DELETE FROM contact_messages')
  raw.close()
})

afterEach(() => { (email as any).mail.send = realSend })

function stored(): any[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT name, email, topic, message, status FROM contact_messages ORDER BY id').all() as any[]
  raw.close()
  return rows
}

async function send(fields: Record<string, unknown>): Promise<number> {
  const req = {
    url: 'http://localhost:4008/api/contact',
    method: 'POST',
    params: {},
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (contactAction as any).handle())
  // The send is detached now (bench-review#55) — the row is stored first and
  // the sender is not made to wait on SMTP — so the response comes back before
  // the mail has gone. Let the detached task run before asserting on it; it
  // awaits a dynamic import, so a microtask flush is not enough.
  await new Promise(resolve => setTimeout(resolve, 25))
  return typeof res?.status === 'number' ? res.status : 200
}

const VALID = { name: 'A. Counsel', email: 'Counsel@Example.test', topic: 'legal', message: 'We represent Judge X and request removal of the review at /article/12.' }

describe('contact intake', () => {
  test('a legal request is stored and delivered', async () => {
    expect(await send(VALID)).toBe(201)

    const [row] = stored()
    expect(row.topic).toBe('legal')
    expect(row.email).toBe('counsel@example.test')
    expect(row.status).toBe('open')
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toContain('legal')
  })

  test('legal and report topics route away from the general inbox', async () => {
    process.env.LEGAL_CONTACT_EMAIL = 'legal@example.test'
    process.env.CONTACT_EMAIL = 'hello@example.test'
    try {
      await send(VALID)
      await send({ ...VALID, topic: 'report' })
      await send({ ...VALID, topic: 'general' })
      // A takedown demand sitting in a shared support queue is how a response
      // window is missed.
      expect(sent.map(m => m.to)).toEqual(['legal@example.test', 'legal@example.test', 'hello@example.test'])
    }
    finally {
      delete process.env.LEGAL_CONTACT_EMAIL
      delete process.env.CONTACT_EMAIL
    }
  })

  test('the message survives a mail failure', async () => {
    ;(email as any).mail.send = async () => { throw new Error('smtp down') }

    expect(await send(VALID)).toBe(201)
    // The whole reason the row is written first.
    expect(stored()).toHaveLength(1)
  })

  test('an unrecognised topic is stored as general, not refused', async () => {
    expect(await send({ ...VALID, topic: 'something-else' })).toBe(201)
    // Losing a legal request over a select-option mismatch would be the exact
    // failure this route exists to fix.
    expect(stored()[0].topic).toBe('general')
  })

  test('junk is refused', async () => {
    expect(await send({ ...VALID, name: '' })).toBe(422)
    expect(await send({ ...VALID, email: 'not-an-email' })).toBe(422)
    expect(await send({ ...VALID, message: 'hi' })).toBe(422)
    expect(stored()).toHaveLength(0)
  })
})

describe('registration assent', () => {
  test('the register action refuses a signup without agreement', async () => {
    const registerAction = (await import('../../app/Actions/Auth/RegisterAction')).default
    ;(Auth as any).user = async () => null

    const fields: Record<string, unknown> = { name: 'A Person', email: 'assent@example.test', password: 'Str0ngPassw0rd' }
    const req = {
      url: 'http://localhost:4008/api/auth/register',
      method: 'POST',
      params: {},
      query: fields,
      get: (k: string) => fields[k],
      all: () => fields,
    }
    const res: any = await runWithRequest(req as any, () => (registerAction as any).handle(req))
    // Checked server-side, not only by the form: a checkbox the browser
    // enforces is a checkbox a scripted signup never sees.
    expect(typeof res?.status === 'number' ? res.status : 200).toBe(422)
  })
})
