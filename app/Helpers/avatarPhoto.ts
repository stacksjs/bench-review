/**
 * Server-side avatar pipeline — backs the Settings "Change photo" button.
 *
 * Strip EXIF, square-crop + resize to a single 256×256 WebP, then persist
 * through the storage facade (app/Storage/disk.ts). Which disk the bytes
 * land on — local by default, S3 when `FILESYSTEM_DISK=s3` — is a config/env
 * decision, so this file never changes when the storage backend does.
 *
 * EXIF stripping is non-negotiable: the audience is legal professionals
 * whose location-history-via-GPS-EXIF is a real retaliation risk. Every
 * upload runs through sharp's metadata strip BEFORE the resize, and the
 * WebP re-encode is a second belt-and-suspenders strip.
 */

import { randomUUID } from 'node:crypto'
import { disk } from '../Storage/disk'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB raw upload cap
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const AVATAR_SIZE = 256

export interface PersistedAvatar {
  url: string
  mime: string
  width: number
  height: number
}

/**
 * Process + persist one avatar image. Returns the public URL of the square
 * WebP. Caller persists the URL onto `users.avatar`. A new UUID filename per
 * upload sidesteps browser caching; the previous object is left in place (a
 * harmless orphan — prune by `uploads/avatars/<id>/` prefix if it matters).
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

  const key = `uploads/avatars/${userId}/${randomUUID()}.webp`
  const { url } = await disk().put(key, out.data, { contentType: 'image/webp' })

  return {
    url,
    mime: 'image/webp',
    width: Number(out.info?.width ?? AVATAR_SIZE),
    height: Number(out.info?.height ?? AVATAR_SIZE),
  }
}
