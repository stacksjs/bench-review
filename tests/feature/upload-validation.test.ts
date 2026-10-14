import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import uploadAction from '../../app/Actions/Reviews/UploadReviewPhotosAction'
import { sniffImageMime } from '../../app/Helpers/reviewPhotos'
import { openTestDatabase } from '../helpers/database'

/**
 * Upload validation and quota — bench-review#56.
 *
 * The pipeline validated `file.type`: a string the uploading client chooses,
 * which says nothing about the file. sharp would fail to decode most
 * non-images afterwards, so the practical exposure was limited — but "the next
 * library happens to reject it" is not a validation step, it is a property of
 * whatever sharp does this release, applied after the bytes are already being
 * handed to a decoder.
 *
 * And the route had a throttle but no quota, so an account could hold an
 * unbounded number of images by spreading them across reviews.
 */

const AUTHOR_ID = 7301
const JUDGE_ID = 7310

/** Smallest valid PNG: 1x1, fully transparent. */
const ONE_PX_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
), c => c.charCodeAt(0))

function reset(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM review_photos')
  raw.run('DELETE FROM judge_reviews')
  raw.run('DELETE FROM judges WHERE id = ?', [JUDGE_ID])
  raw.run('DELETE FROM users WHERE id = ?', [AUTHOR_ID])
  raw.run('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\'))', [AUTHOR_ID, 'Author', 'upload-author@example.test'])
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (?, \'A Judge\', datetime(\'now\'))', [JUDGE_ID])
  raw.close()
}

function seedReview(judgeOffset: number = 0): number {
  const raw = openTestDatabase()
  const judgeId = JUDGE_ID + judgeOffset
  if (judgeOffset > 0)
    raw.run('INSERT OR IGNORE INTO judges (id, name, created_at) VALUES (?, ?, datetime(\'now\'))', [judgeId, `Judge ${judgeId}`])
  raw.run(
    'INSERT INTO judge_reviews (judge_id, user_id, title, content, rating, status, uuid, created_at) VALUES (?, ?, ?, ?, 3, \'pending\', ?, datetime(\'now\'))',
    [judgeId, AUTHOR_ID, 'A review', 'body', `upload-${judgeId}-${Date.now()}-${Math.random()}`],
  )
  const row = raw.query('SELECT id FROM judge_reviews ORDER BY id DESC LIMIT 1').get() as { id: number }
  raw.close()
  return Number(row.id)
}

/** Pre-load rows so the account is already holding `n` photos. */
function giveUserPhotos(reviewId: number, n: number): void {
  const raw = openTestDatabase()
  for (let i = 0; i < n; i++) {
    raw.run(
      'INSERT INTO review_photos (judge_review_id, user_id, thumb_url, card_url, full_url, mime, width, height, order_index, created_at) VALUES (?, ?, \'t\', \'c\', \'f\', \'image/webp\', 1, 1, ?, datetime(\'now\'))',
      [reviewId, AUTHOR_ID, i],
    )
  }
  raw.close()
}

function photoCount(): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT COUNT(*) AS c FROM review_photos WHERE user_id = ?').get(AUTHOR_ID) as { c: number }
  raw.close()
  return Number(row.c)
}

async function upload(reviewId: number, files: Array<{ bytes: Uint8Array | string, name: string, type: string }>): Promise<{ status: number, body: any }> {
  ;(Auth as any).user = async () => ({ id: AUTHOR_ID })

  const form = new FormData()
  for (const f of files)
    form.append('photos', new File([f.bytes as any], f.name, { type: f.type }))

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

describe('uploads are validated by their bytes', () => {
  beforeEach(reset)

  test('the sniffer reads the header, not the name', () => {
    expect(sniffImageMime(ONE_PX_PNG)).toBe('image/png')
    expect(sniffImageMime(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]))).toBe('image/jpeg')
    // RIFF....WEBP — the four size bytes between the two tags are not fixed.
    expect(sniffImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')

    expect(sniffImageMime(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull()
    expect(sniffImageMime(new TextEncoder().encode('GIF89a'))).toBeNull()
    expect(sniffImageMime(new Uint8Array([]))).toBeNull()
    // A truncated PNG signature is not a PNG.
    expect(sniffImageMime(ONE_PX_PNG.slice(0, 5))).toBeNull()
  })

  test('a non-image labelled image/png is refused', async () => {
    const id = seedReview()
    const res = await upload(id, [{ bytes: '<?php system($_GET[0]); ?>', name: 'shell.png', type: 'image/png' }])

    expect(res.status).toBe(422)
    expect(photoCount()).toBe(0)
    // Refused by the HEADER check, before any decoder sees it — which is what
    // the specific wording pins. Without the magic-byte read this still fails,
    // but only later and with whatever sharp happens to say.
    expect(String(res.body?.error)).toContain('not a JPEG, PNG or WebP image')
  })

  test('a file whose header is an image but whose body is not is refused', async () => {
    const id = seedReview()
    // A valid 8-byte PNG signature and nothing decodable after it. This is the
    // case the magic-byte check alone would let through, which is why sharp's
    // read is treated as canonical on top of it.
    const header = ONE_PX_PNG.slice(0, 8)
    const junk = new Uint8Array(64)
    const frankenstein = new Uint8Array(header.length + junk.length)
    frankenstein.set(header)
    frankenstein.set(junk, header.length)

    const res = await upload(id, [{ bytes: frankenstein, name: 'looks-ok.png', type: 'image/png' }])

    expect(res.status).toBe(422)
    expect(photoCount()).toBe(0)
    // Caught by sharp's read, reported as something a person can act on. Drop
    // that check and the resize chain still throws — three pipelines later,
    // with a raw decoder error surfacing in the response.
    expect(String(res.body?.error)).toContain('could not be read')
  })

  test('a real image is still accepted, whatever the client calls it', async () => {
    const id = seedReview()
    // Declared as a JPEG; the bytes are a PNG. The bytes win, and it works.
    const res = await upload(id, [{ bytes: ONE_PX_PNG, name: 'mislabelled.jpg', type: 'image/jpeg' }])

    // 201 Created, as the action returns for a successful attach.
    expect(res.status).toBe(201)
    expect(photoCount()).toBe(1)
  })
})

describe('uploads are capped per account', () => {
  beforeEach(reset)

  test('an account at its limit cannot add more, across any review', async () => {
    // Twelve already held, spread over an earlier review — the per-review cap
    // of 4 does not see them.
    const older = seedReview(1)
    giveUserPhotos(older, 12)

    const fresh = seedReview(2)
    const res = await upload(fresh, [{ bytes: ONE_PX_PNG, name: 'one-more.png', type: 'image/png' }])

    expect(res.status).toBe(422)
    expect(String(res.body?.error)).toContain('12-photo limit')
    expect(photoCount()).toBe(12)
  })

  test('a batch that would cross the limit is refused whole, not part-written', async () => {
    const older = seedReview(1)
    giveUserPhotos(older, 10)

    const fresh = seedReview(2)
    const res = await upload(fresh, [
      { bytes: ONE_PX_PNG, name: 'a.png', type: 'image/png' },
      { bytes: ONE_PX_PNG, name: 'b.png', type: 'image/png' },
      { bytes: ONE_PX_PNG, name: 'c.png', type: 'image/png' },
    ])

    expect(res.status).toBe(422)
    // Not 12. A partial write would leave the author at the cap with no
    // message saying which of the three landed.
    expect(photoCount()).toBe(10)
  })

  test('under the limit, an upload still works', async () => {
    const older = seedReview(1)
    giveUserPhotos(older, 3)

    const fresh = seedReview(2)
    const res = await upload(fresh, [{ bytes: ONE_PX_PNG, name: 'fine.png', type: 'image/png' }])

    expect(res.status).toBe(201)
    expect(photoCount()).toBe(4)
  })
})
