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

/**
 * What the BYTES have to say they are (bench-review#56).
 *
 * The pipeline used to validate `file.type` — a string the uploading client
 * chooses — which says nothing at all about the file. Anyone could label a
 * payload `image/png` and have it accepted into the processing path on that
 * basis alone.
 *
 * sharp would then fail to decode most non-images, so the practical exposure
 * was limited, but "the next library in the chain happens to reject it" is not
 * a validation step: it makes the format check a property of whatever sharp
 * does this release, applied after the bytes are already in memory and being
 * handed to a decoder.
 *
 * So the type is now read out of the file's own header, and the client's claim
 * is ignored entirely. sharp's decode stays as the second, canonical check —
 * a file can have a valid 12-byte header and still be junk.
 */
const MAGIC: Array<{ mime: string, match: (b: Uint8Array) => boolean }> = [
  // FF D8 FF — JPEG/JFIF/Exif all share it.
  { mime: 'image/jpeg', match: b => b.length > 2 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  // The 8-byte PNG signature, including the CRLF/EOF bytes that exist to
  // catch exactly this sort of transfer mangling.
  { mime: 'image/png', match: b => b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A },
  // RIFF....WEBP — the four size bytes in between are not fixed.
  {
    mime: 'image/webp',
    match: b => b.length > 11
      && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
]

/** The image type these bytes actually are, or null if they are not one we take. */
export function sniffImageMime(buf: Uint8Array): string | null {
  for (const { mime, match } of MAGIC) {
    if (match(buf))
      return mime
  }
  return null
}

/** What sharp reporting a given format means in our terms. */
const SHARP_FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

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
  const buf = new Uint8Array(await file.arrayBuffer())
  // Size first: the cheapest check, and it bounds everything after it.
  if (buf.byteLength > MAX_BYTES)
    throw new Error(`Image too large (${Math.round(buf.byteLength / 1024 / 1024)} MB) — max 8 MB.`)

  // The declared type is read but never trusted — see MAGIC above. It is kept
  // only to say something useful when the two disagree, which is the case
  // worth distinguishing from "that is not an image".
  const sniffed = sniffImageMime(buf)
  if (!sniffed) {
    throw new Error(mime
      ? `That file is not a JPEG, PNG or WebP image, whatever its name or type says (${mime}).`
      : 'Only JPEG / PNG / WebP images are accepted.')
  }

  // Lazy-import sharp so the module isn't loaded for non-upload code
  // paths. Stacks's @stacksjs/storage uses the same lazy pattern.
  const sharpMod = await import('sharp').then(m => m.default ?? m)
  const sharp = sharpMod as (input: Uint8Array) => any

  // sharp's own read is canonical: a file can carry a valid 12-byte header and
  // be nothing but that header. If it cannot be decoded there is no image
  // here, whatever the magic bytes promised.
  let decodedFormat: string
  try {
    decodedFormat = String((await sharp(buf).metadata())?.format ?? '')
  }
  catch {
    throw new Error('That image could not be read. It may be corrupt or only partly uploaded.')
  }
  const decodedMime = SHARP_FORMAT_MIME[decodedFormat]
  if (!decodedMime)
    throw new Error('Only JPEG / PNG / WebP images are accepted.')
  // Disagreement between the header and the decoder means a file built to be
  // read as two different things depending on who is looking. Refuse it rather
  // than pick a winner.
  if (decodedMime !== sniffed)
    throw new Error('That file does not match its own image header.')

  // Strip metadata BEFORE the resize chain. Each .toBuffer() forks
  // its own pipeline so a previous variant's transforms don't leak
  // into the next size.
  const base = (): any => sharp(buf).rotate() // auto-orient via EXIF orientation tag, then strip everything else below

  const photoId = randomUUID()
  const keyFor = (label: 'thumb' | 'card' | 'full'): string => `uploads/review-photos/${reviewUuid}/${photoId}.${label}.webp`
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
