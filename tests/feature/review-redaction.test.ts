import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import redactAction from '../../app/Actions/Admin/Reviews/RedactReviewAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Redaction — bench-review#53.
 *
 * Moderation was whole-review only: flip the status, or take it down. The case
 * this site will actually meet is a review that is lawful and worth keeping
 * except for one sentence — a judge's home address, a phone number, a family
 * member's name. Under the Daniel Anderl Act and the state Daniel's Laws the
 * obligation is to remove the covered information, not the opinion around it,
 * and deleting the whole review to comply is over-removal.
 *
 * The FAQ has promised "we will remove or edit it" since launch, with no admin
 * edit path behind it.
 */

const ADMIN = 9401
const AUTHOR = 9402
const ORIGINAL = '<p>Fair in court. He lives at 12 Elm Street and his number is 555-0100.</p>'

function seed(): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [ADMIN, AUTHOR])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [ADMIN, 'Mod', 'redact-mod@example.test', AUTHOR, 'Author', 'redact-author@example.test'],
  )
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\'))')
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (1, ?, ?, ?, 4, \'published\', ?, datetime(\'now\'))',
    [AUTHOR, 'Fair but slow', ORIGINAL, `rd-${Date.now()}`],
  )
  const id = Number((raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as any).id)
  raw.close()
  return id
}

function row(id: number): any {
  const raw = openTestDatabase()
  const r = raw.query('SELECT title, content, status FROM judge_reviews WHERE id = ?').get(id)
  raw.close()
  return r
}

function logs(): any[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT action, note, metadata FROM moderation_logs ORDER BY id').all() as any[]
  raw.close()
  return rows
}

async function redact(id: string, fields: Record<string, unknown>): Promise<number> {
  const req = {
    url: `http://localhost:4008/api/admin/reviews/${id}/content`,
    method: 'PATCH',
    params: { id },
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (redactAction as any).handle())
  return typeof res?.status === 'number' ? res.status : 200
}

describe('review redaction', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: ADMIN }) })

  test('covered information goes, the review stays published', async () => {
    const id = seed()

    expect(await redact(String(id), {
      content: '<p>Fair in court.</p>',
      note: 'Daniel Anderl Act request — home address and phone number.',
    })).toBe(200)

    const r = row(id)
    expect(r.content).toBe('<p>Fair in court.</p>')
    // The opinion survives. Deleting the whole review to comply would be
    // over-removal and a worse outcome for the author.
    expect(r.status).toBe('published')
  })

  test('the original is preserved with the reason', async () => {
    const id = seed()
    await redact(String(id), { content: '<p>Fair in court.</p>', note: 'Removal request: address.' })

    const entry = logs().find(l => l.action === 'review.redact')
    expect(entry.note).toBe('Removal request: address.')
    const meta = JSON.parse(entry.metadata)
    // The redaction overwrites in place, so this is the only record of what
    // was published — and of why it differs.
    expect(meta.snapshot.content).toBe(ORIGINAL)
  })

  test('a reason is required', async () => {
    const id = seed()
    expect(await redact(String(id), { content: '<p>Fair in court.</p>' })).toBe(422)
    // Nothing changed, and nothing logged.
    expect(row(id).content).toBe(ORIGINAL)
    expect(logs()).toHaveLength(0)
  })

  test('the content is sanitized, not trusted', async () => {
    const id = seed()
    await redact(String(id), { content: '<p>Fair.</p><xmp><script>alert(1)</script></xmp>', note: 'Removing address.' })

    const content = row(id).content
    // The sanitizer is what holds the raw-text-element XSS bypass closed; an
    // admin is trusted to decide WHAT to remove, not to hand-write raw HTML
    // into a public page.
    expect(content).not.toContain('<script>')
    expect(content).not.toContain('<xmp>')
  })

  test('redacting a review to nothing is refused', async () => {
    const id = seed()
    // If there is nothing left worth publishing, the honest action is a
    // takedown, which preserves the row and says so.
    expect(await redact(String(id), { content: '<p>   </p>', note: 'Removing everything.' })).toBe(422)
    expect(row(id).content).toBe(ORIGINAL)
  })

  test('a missing review is a 404 and an empty patch is refused', async () => {
    seed()
    expect(await redact('999999', { content: '<p>x</p>', note: 'a reason' })).toBe(404)
    const id = seed()
    expect(await redact(String(id), { note: 'a reason' })).toBe(422)
  })
})
