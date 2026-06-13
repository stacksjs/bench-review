/**
 * Server-side avatar pipeline — backs the Settings "Change photo" button.
 *
 * Mirrors reviewPhotos.ts: take a raw uploaded image, strip metadata,
 * square-crop + resize to a single 256×256 WebP, write to local storage,
 * return the persisted public URL. Centralised here so the action stays
 * thin and — per the "local now, S3 later" decision — the disk write is
 * isolated to ONE place: swapping to S3 means routing `out.data` through
 * `@stacksjs/storage` (`put`/`putUploadedFile`) against the `s3` disk and
 * returning the CDN URL, with nothing else in the feature touched.
 *
 * EXIF stripping is non-negotiable: the audience is legal professionals
 * whose location-history-via-GPS-EXIF is a real retaliation risk. Every
 * upload runs through sharp's metadata strip BEFORE the resize, and the
 * WebP re-encode is a second belt-and-suspenders strip.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB raw upload cap
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const AVATAR_SIZE = 256

const STORAGE_ROOT = join(process.cwd(), 'storage', 'uploads', 'avatars')
const PUBLIC_PREFIX = '/storage/uploads/avatars'

export interface PersistedAvatar {
  url: string
  mime: string
  width: number
  height: number
}

/**
 * Process + persist one avatar image. Returns the public URL of the
 * square WebP. Caller persists the URL onto `users.avatar`. A new UUID
 * filename per upload sidesteps browser caching; the previous file is
 * left on disk (a harmless orphan under the local driver — the future
 * S3 adapter can prune by prefix).
 */
export async function processAndPersistAvatar(
  userId: number | string,
  file: File | Blob,
  mime: string,
): Promise<PersistedAvatar> {
  if (!ALLOWED_MIME.has(mime))
    throw new Error('Only JPEG / PNG / WebP images are accepted.')

  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf.byteLength > MAX_BYTES)
    throw new Error(`Image too large (${Math.round(buf.byteLength / 1024 / 1024)} MB) — max 5 MB.`)

  // Lazy-import sharp so the module isn't loaded for non-upload paths.
  const sharpMod = await import('sharp').then(m => m.default ?? m)
  const sharp = sharpMod as (input: Uint8Array) => any

  // rotate() auto-orients via the EXIF orientation tag; withMetadata({})
  // then strips everything (incl. GPS) before the WebP encode.
  const out = await sharp(buf)
    .rotate()
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: 'cover' })
    .withMetadata({})
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })

  const dir = join(STORAGE_ROOT, String(userId))
  mkdirSync(dir, { recursive: true })
  const filename = `${randomUUID()}.webp`
  writeFileSync(join(dir, filename), out.data)

  return {
    url: `${PUBLIC_PREFIX}/${userId}/${filename}`,
    mime: 'image/webp',
    width: Number(out.info?.width ?? AVATAR_SIZE),
    height: Number(out.info?.height ?? AVATAR_SIZE),
  }
}
