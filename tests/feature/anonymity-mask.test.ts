import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import indexAction from '../../app/Actions/Admin/Reviews/ReviewIndexAction'
import revealAction from '../../app/Actions/Admin/Reviews/RevealReviewAuthorAction'
import { authorRef } from '../../app/Helpers/anonymityMask'
import { openTestDatabase } from '../helpers/database'

/**
 * Admin-side anonymity masking — bench-review#56.
 *
 * This site publishes criticism of named, sitting judges, and the thing that
 * makes that safe to write is the anonymity promise. The admin review queue
 * was the one place it did not hold: every row carried the author's real name
 * and email whether or not they had asked to be anonymous, behind a single
 * password. One compromised moderator account de-anonymized every anonymous
 * reviewer on the site at once, and left no trace of having done it.
 */

const ADMIN = 9601
const ANON_AUTHOR = 9602
const NAMED_AUTHOR = 9603

interface Seeded { anon: number, named: number, anonSecond: number }

function seed(): Seeded {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM moderation_logs')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id IN (?, ?, ?)', [ADMIN, ANON_AUTHOR, NAMED_AUTHOR])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [
      ADMIN, 'Mod', 'mask-mod@example.test',
      ANON_AUTHOR, 'Dana Whistle', 'dana.whistle@example.test',
      NAMED_AUTHOR, 'Openly Named', 'openly.named@example.test',
    ],
  )
  // Two judges, because `judge_reviews` carries a partial unique index on
  // (user_id, judge_id) for non-rejected rows — one author cannot have two
  // pending reviews of the SAME judge, which is exactly the point of it.
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\')), (2, \'Another Judge\', datetime(\'now\'))')

  const insert = (userId: number, judgeId: number, anonymized: number, title: string): number => {
    raw.run(
      'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, anonymized, uuid, created_at) VALUES (?, ?, ?, \'<p>Body text here.</p>\', 4, \'pending\', ?, ?, datetime(\'now\'))',
      [judgeId, userId, title, anonymized, `mask-${title}-${Date.now()}`],
    )
    return Number((raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as any).id)
  }

  const anon = insert(ANON_AUTHOR, 1, 1, 'anon-one')
  const anonSecond = insert(ANON_AUTHOR, 2, 1, 'anon-two')
  const named = insert(NAMED_AUTHOR, 1, 0, 'named-one')
  raw.close()
  return { anon, named, anonSecond }
}

async function listReviews(): Promise<any[]> {
  const fields = { status: 'all', perPage: 100 }
  const req = {
    url: 'http://localhost:4008/api/admin/reviews?status=all',
    method: 'GET',
    params: {},
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (indexAction as any).handle())
  const body = typeof res?.json === 'function' ? await res.json() : res
  return (body?.reviews ?? []) as any[]
}

async function reveal(id: number, fields: Record<string, unknown>): Promise<{ status: number, body: any }> {
  const req = {
    url: `http://localhost:4008/api/admin/reviews/${id}/author`,
    method: 'POST',
    params: { id: String(id) },
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (revealAction as any).handle())
  const body = typeof res?.json === 'function' ? await res.json() : res
  return { status: typeof res?.status === 'number' ? res.status : 200, body }
}

function logs(): any[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT actor_user_id, action, target_id, note, metadata FROM moderation_logs ORDER BY id').all() as any[]
  raw.close()
  return rows
}

describe('admin anonymity masking', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: ADMIN }) })

  test('an anonymized author carries no name or email through the queue', async () => {
    const { anon } = seed()
    const row = (await listReviews()).find(r => r.id === anon)

    expect(row.user.anonymized).toBe(true)
    expect(row.user.id).toBeNull()
    expect(row.user.email).toBeNull()
    // The real name must not survive anywhere on the row, including as the
    // display name — a masked row whose `name` is still 'Dana Whistle' is not
    // masked at all.
    expect(JSON.stringify(row)).not.toContain('Dana Whistle')
    expect(JSON.stringify(row)).not.toContain('dana.whistle@example.test')
  })

  test('an author who did NOT ask for anonymity is still shown', async () => {
    const { named } = seed()
    const row = (await listReviews()).find(r => r.id === named)

    expect(row.user.anonymized).toBe(false)
    expect(row.user.id).toBe(NAMED_AUTHOR)
    expect(row.user.email).toBe('openly.named@example.test')
  })

  test('two anonymous reviews by one author share a ref, so repeat abuse is still visible', async () => {
    const { anon, anonSecond } = seed()
    const rows = await listReviews()
    const a = rows.find(r => r.id === anon)
    const b = rows.find(r => r.id === anonSecond)

    // This is what keeps the mask usable: a moderator can see it is the same
    // person twice without learning who the person is.
    expect(a.user.author_ref).toBe(b.user.author_ref)
    expect(a.user.author_ref).toBe(authorRef(ANON_AUTHOR))
    expect(a.user.author_ref).not.toContain(String(ANON_AUTHOR))
  })

  test('the ref is keyed, not a bare hash of a guessable id', async () => {
    // User ids are small sequential integers, so an unkeyed digest would be
    // reversible by hashing 1..n offline. Assert the ref is NOT the plain
    // sha256 of the id in any of the obvious spellings.
    const { createHash } = await import('node:crypto')
    const plain = [
      String(ANON_AUTHOR),
      `author:${ANON_AUTHOR}`,
    ].map(s => `A-${createHash('sha256').update(s).digest('hex').slice(0, 12)}`)

    expect(plain).not.toContain(authorRef(ANON_AUTHOR))
  })

  test('reveal returns the identity and records who asked, and why', async () => {
    const { anon } = seed()
    const { status, body } = await reveal(anon, { note: 'Threat assessment — review names a family member.' })

    expect(status).toBe(200)
    expect(body.author.email).toBe('dana.whistle@example.test')
    expect(body.was_masked).toBe(true)

    const entry = logs().find(l => l.action === 'review.reveal_author')
    expect(entry.actor_user_id).toBe(ADMIN)
    expect(entry.target_id).toBe(anon)
    expect(entry.note).toBe('Threat assessment — review names a family member.')
    // The log identifies WHICH author was unmasked without restating the
    // identity: a moderation log that accumulates plaintext emails of
    // anonymous reviewers is its own breach waiting to happen.
    const meta = JSON.parse(entry.metadata)
    expect(meta.author_ref).toBe(authorRef(ANON_AUTHOR))
    expect(entry.metadata).not.toContain('dana.whistle@example.test')
  })

  test('a reason is required, and nothing is revealed without one', async () => {
    const { anon } = seed()
    const { status, body } = await reveal(anon, {})

    expect(status).toBe(422)
    expect(body.author).toBeUndefined()
    expect(logs()).toHaveLength(0)
  })

  test('a review with no account attached cannot be revealed', async () => {
    seed()
    const raw = openTestDatabase()
    raw.run('INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, anonymized, uuid, created_at) VALUES (1, NULL, \'orphan\', \'<p>Body.</p>\', 3, \'pending\', 1, ?, datetime(\'now\'))', [`mask-orphan-${Date.now()}`])
    const orphan = Number((raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as any).id)
    raw.close()

    expect((await reveal(orphan, { note: 'Checking an orphaned row.' })).status).toBe(404)
  })
})
