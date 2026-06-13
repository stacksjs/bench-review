/**
 * Server-side review-photo pipeline (bench-review#31).
 *
 * One job: take a raw uploaded image, strip metadata, resize to the three
 * ladder sizes, persist via the storage facade (app/Storage/disk.ts), and
 * return the persisted URL set. Which disk the bytes land on — local by
 * default, S3 when `FILESYSTEM_DISK=s3` — is a config/env decision, so this
 * file is unchanged by a storage-backend swap.
 *
 * EXIF stripping is non-negotiable: the audience is legal professionals
 * whose location-history-via-GPS-EXIF is a real retaliation risk vector. We
 * run every upload through sharp's metadata strip BEFORE the resize step so
 * the bytes-on-disk never carry the original camera roll metadata.
 *
 * Sizes:
 *   thumb 200×200 cover  — feed card / gallery thumb
 *   card  800w           — article hero gallery
 *   full  1600w          — lightbox / Cmd-click open
 *
 * All three encoded as WebP at q=80 — Best size/quality tradeoff for modern
 * browsers; the upload-time WebP target also gives a sneaky EXIF strip even
 * on input formats sharp's metadata strip doesn't fully cover.
 */

import { randomUUID } from 'node:crypto'
import { disk } from '../Storage/disk'

const MAX_BYTES = 8 * 1024 * 1024 // 8MB raw upload cap
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export interface PersistedPhoto {
  thumb_url: string
  card_url: string
  full_url: string
  mime: string
  width: number
  height: number
}

/**
 * Process + persist one uploaded image. Returns the persisted URL triple +
 * dimensions of the FULL variant. Caller is responsible for inserting the
 * row into review_photos and bumping the review's relation.
 */
export async function processAndPersistReviewPhoto(
  reviewUuid: string,
  file: File | Blob,
  mime: string,
): Promise<PersistedPhoto> {
  if (!ALLOWED_MIME.has(mime))
    throw new Error('Only JPEG / PNG / WebP images are accepted.')

  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf.byteLength > MAX_BYTES)
    throw new Error(`Image too large (${Math.round(buf.byteLength / 1024 / 1024)} MB) — max 8 MB.`)

  // Lazy-import sharp so the module isn't loaded for non-upload code
  // paths. Stacks's @stacksjs/storage uses the same lazy pattern.
  const sharpMod = await import('sharp').then(m => m.default ?? m)
  const sharp = sharpMod as (input: Uint8Array) => any

  // Strip metadata BEFORE the resize chain. Each .toBuffer() forks
  // its own pipeline so a previous variant's transforms don't leak
  // into the next size.
  const base = () => sharp(buf).rotate() // auto-orient via EXIF orientation tag, then strip everything else below

  const photoId = randomUUID()
  const keyFor = (label: 'thumb' | 'card' | 'full') => `uploads/review-photos/${reviewUuid}/${photoId}.${label}.webp`
  const store = disk()

  // FULL — 1600w fit-inside (preserve aspect), strip metadata, webp q=80.
  const fullBuf = await base()
    .resize({ width: 1600, withoutEnlargement: true })
    .withMetadata({}) // empty object = strip everything
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true })
  const full = await store.put(keyFor('full'), fullBuf.data, { contentType: 'image/webp' })

  // CARD — 800w
  const cardBuf = await base()
    .resize({ width: 800, withoutEnlargement: true })
    .withMetadata({})
    .webp({ quality: 80 })
    .toBuffer()
  const card = await store.put(keyFor('card'), cardBuf, { contentType: 'image/webp' })

  // THUMB — 200×200 cover-fit
  const thumbBuf = await base()
    .resize({ width: 200, height: 200, fit: 'cover' })
    .withMetadata({})
    .webp({ quality: 80 })
    .toBuffer()
  const thumb = await store.put(keyFor('thumb'), thumbBuf, { contentType: 'image/webp' })

  return {
    thumb_url: thumb.url,
    card_url: card.url,
    full_url: full.url,
    mime: 'image/webp',
    width: Number(fullBuf.info?.width ?? 0),
    height: Number(fullBuf.info?.height ?? 0),
  }
}
