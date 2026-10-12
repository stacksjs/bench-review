import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import uploadAction from '../../app/Actions/Reviews/UploadReviewPhotosAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Photos and moderation — bench-review#51.
 *
 * The rule being pinned: **a photo added to a PUBLISHED review sends it back
 * to pending.** Text edits have always done that; photos did not, so the one
 * channel that could put an unreviewed image on a live page about a named
 * judge was also the only channel that bypassed moderation. An author could
 * publish text, wait for approval, then attach anything.
 *
 * These drive the real action with a real 1×1 PNG, so the whole path runs —
 * multipart parse, mime gate, the sharp pipeline, the row write, and the
 * status decision that depends on all of it having worked.
 */

const AUTHOR_ID = 7101
const OTHER_ID = 7102

/** Smallest valid PNG: 1×1, fully transparent. */
const ONE_PX_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
), c => c.charCodeAt(0))

function seedReview(status: string): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_photos')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM users WHERE id IN (?, ?)', [AUTHOR_ID, OTHER_ID])
  raw.run(
    'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\')), (?, ?, ?, datetime(\'now\'))',
    [AUTHOR_ID, 'Author', 'author@example.test', OTHER_ID, 'Someone else', 'other@example.test'],
  )
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (1, ?, ?, ?, 3, ?, ?, datetime(\'now\'))',
    [AUTHOR_ID, 'A review', 'body', status, `photo-test-${status}-${Date.now()}`],
  )
  const row = raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as { id: number }
  raw.close()
  return Number(row.id)
}

function statusOf(reviewId: number): string {
  const raw = openTestDatabase()
  const row = raw.query('SELECT status FROM judge_reviews WHERE id = ?').get(reviewId) as { status: string }
  raw.close()
  return row.status
}

function photoCount(reviewId: number): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT COUNT(*) AS c FROM review_photos WHERE judge_review_id = ?').get(reviewId) as { c: number }
  raw.close()
  return Number(row.c)
}

async function upload(reviewId: number, asUserId: number, files: number = 1): Promise<{ status: number, body: any }> {
  ;(Auth as any).user = async () => ({ id: asUserId })

  const form = new FormData()
  for (let i = 0; i < files; i++)
    form.append('photos', new File([ONE_PX_PNG], `shot-${i}.png`, { type: 'image/png' }))

  const req = {
    url: `http://localhost:4008/api/reviews/${reviewId}/photos`,
    method: 'POST',
    params: { id: String(reviewId) },
    query: {},
    get: () => undefined,
    all: () => ({}),
    formData: async () => form,
  }
  const res: any = await runWithRequest(req as any, () => (uploadAction as any).handle())
  const status = typeof res?.status === 'number' ? res.status : 200
  let body: any = null
  try { body = typeof res?.json === 'function' ? await res.json() : res }
  catch { body = res }
  return { status, body }
}

describe('review photos and moderation', () => {
  beforeEach(() => { (Auth as any).user = async () => ({ id: AUTHOR_ID }) })

  test('a photo on a PUBLISHED review sends it back to pending', async () => {
    const id = seedReview('published')
    const res = await upload(id, AUTHOR_ID)

    // 201: the action reports created, not merely ok.
    expect(res.status).toBe(201)
    expect(photoCount(id)).toBe(1)
    // The whole point: the page now shows an image no moderator has seen.
    expect(statusOf(id)).toBe('pending')
    // And the author is told, rather than watching their review vanish.
    expect(res.body?.returned_to_queue).toBe(true)
  })

  test('a photo on a PENDING review leaves it pending, and says nothing happened', async () => {
    const id = seedReview('pending')
    const res = await upload(id, AUTHOR_ID)

    expect(res.status).toBe(201)
    expect(photoCount(id)).toBe(1)
    expect(statusOf(id)).toBe('pending')
    // Nothing to announce — it was never out of the queue.
    expect(res.body?.returned_to_queue).toBe(false)
  })

  test('a rejected review is not resurrected into the queue by a photo', async () => {
    const id = seedReview('rejected')
    await upload(id, AUTHOR_ID)
    expect(statusOf(id)).toBe('rejected')
  })

  test('a non-owner cannot attach anything, and the review is untouched', async () => {
    const id = seedReview('published')
    const res = await upload(id, OTHER_ID)

    // Same shape as a missing review — ownership is not a hint to be probed.
    expect(res.status).toBe(404)
    expect(photoCount(id)).toBe(0)
    expect(statusOf(id)).toBe('published')
  })

  test('a failed upload does not knock a published review offline', async () => {
    const id = seedReview('published')
    ;(Auth as any).user = async () => ({ id: AUTHOR_ID })

    // A text file posing as a photo: rejected by the mime gate, so nothing
    // is persisted — and a review must not be taken off the site by an
    // upload that never landed.
    const form = new FormData()
    form.append('photos', new File([new TextEncoder().encode('not an image')], 'notes.txt', { type: 'text/plain' }))
    const req = {
      url: `http://localhost:4008/api/reviews/${id}/photos`,
      method: 'POST',
      params: { id: String(id) },
      query: {},
      get: () => undefined,
      all: () => ({}),
      formData: async () => form,
    }
    await runWithRequest(req as any, () => (uploadAction as any).handle())

    expect(photoCount(id)).toBe(0)
    expect(statusOf(id)).toBe('published')
  })
})
