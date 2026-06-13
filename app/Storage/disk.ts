/**
 * Storage facade — a tiny, owned disk abstraction for uploaded media.
 *
 *   disk().put('uploads/avatars/1/x.webp', bytes, { contentType: 'image/webp' })
 *   disk('s3').put(key, bytes)
 *   disk().url(key)
 *
 * Switching disks is a config/env decision, never a code change:
 *   - default disk = `config/filesystems.ts` → `default` (driven by
 *     `FILESYSTEM_DISK` in .env: `local` | `s3`),
 *   - `disk('s3')` / `disk('local')` selects one explicitly.
 *
 * Two drivers:
 *   - local — `node:fs` under `storage/`, served at `/storage/...` (the
 *     convention the dev/prod API already serves review photos from), so
 *     nothing about static serving changes.
 *   - s3 — Bun's NATIVE S3 client (`Bun.S3Client`, Bun ≥ 1.1), so there's no
 *     AWS SDK dependency. Bucket/region/endpoint/credentials come from the
 *     `s3` export in `config/filesystems.ts` (which reads `.env`); blank
 *     credentials fall through to Bun's own AWS credential chain.
 *
 * Why owned rather than the framework `@stacksjs/storage` facade: that one
 * reads a different (flat) config schema than this project's and roots its
 * disks at `storage/app` / `public/`, which wouldn't match the existing
 * `/storage/uploads/...` URLs without reworking static serving. This stays
 * in lock-step with the current convention and is ~80 lines we control.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import filesystems, { s3 as s3Config } from '../../config/filesystems'

export type DiskName = 'local' | 's3' | (string & {})

export interface PutOptions {
  /** MIME type stored as the object's content-type (S3); ignored by local. */
  contentType?: string
}

export interface PutResult {
  /** The key as stored (includes any S3 prefix). */
  key: string
  /** Public URL to fetch the object. */
  url: string
}

export interface Disk {
  readonly name: string
  put: (key: string, data: Uint8Array | Buffer | string, opts?: PutOptions) => Promise<PutResult>
  url: (key: string) => string
  delete: (key: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// local driver — storage/<key> served at /storage/<key>
// ---------------------------------------------------------------------------
function createLocalDisk(): Disk {
  const root = join(process.cwd(), 'storage')
  const urlFor = (key: string) => `/storage/${key.replace(/^\/+/, '')}`
  return {
    name: 'local',
    async put(key, data) {
      const full = join(root, key)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, typeof data === 'string' ? data : (data as Uint8Array))
      return { key, url: urlFor(key) }
    },
    url: urlFor,
    async delete(key) {
      await rm(join(root, key), { force: true }).catch(() => {})
    },
  }
}

// ---------------------------------------------------------------------------
// s3 driver — Bun.S3Client; config/env via config/filesystems.ts `s3`
// ---------------------------------------------------------------------------
function createS3Disk(): Disk {
  // Lazy client so local-only dev never constructs S3.
  let client: any
  function s3(): any {
    if (client)
      return client
    if (!s3Config.bucket)
      throw new Error('[storage] s3 disk selected but no bucket — set AWS_BUCKET in .env (or config/filesystems.ts → s3.bucket).')
    const opts: Record<string, unknown> = { bucket: s3Config.bucket, region: s3Config.region }
    if (s3Config.endpoint)
      opts.endpoint = s3Config.endpoint
    // Only pass explicit creds when both are present; otherwise let Bun's
    // S3 credential chain pick them up (AWS_* env / instance role).
    if (s3Config.credentials.accessKeyId && s3Config.credentials.secretAccessKey) {
      opts.accessKeyId = s3Config.credentials.accessKeyId
      opts.secretAccessKey = s3Config.credentials.secretAccessKey
    }
    client = new (Bun as any).S3Client(opts)
    return client
  }

  const prefixed = (key: string) => {
    const k = key.replace(/^\/+/, '')
    const p = s3Config.prefix.replace(/^\/+|\/+$/g, '')
    return p ? `${p}/${k}` : k
  }

  const urlFor = (key: string) => {
    const k = prefixed(key)
    if (s3Config.publicUrl)
      return `${s3Config.publicUrl.replace(/\/+$/, '')}/${k}`
    if (s3Config.endpoint)
      return `${s3Config.endpoint.replace(/\/+$/, '')}/${s3Config.bucket}/${k}`
    return `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${k}`
  }

  return {
    name: 's3',
    async put(key, data, opts) {
      const k = prefixed(key)
      await s3().write(k, data, opts?.contentType ? { type: opts.contentType } : undefined)
      return { key: k, url: urlFor(key) }
    },
    url: urlFor,
    async delete(key) {
      await s3().delete(prefixed(key))
    },
  }
}

// ---------------------------------------------------------------------------
// facade
// ---------------------------------------------------------------------------
const cache: Record<string, Disk> = {}

/**
 * Resolve a disk by name, or the configured default (`FILESYSTEM_DISK`).
 * Adapters are memoised so the S3 client is built once per process.
 */
export function disk(name?: DiskName): Disk {
  const diskName = name || filesystems.default || 'local'
  if (cache[diskName])
    return cache[diskName]

  let resolved: Disk
  if (diskName === 's3')
    resolved = createS3Disk()
  else if (diskName === 'local' || diskName === 'public')
    resolved = createLocalDisk()
  else
    throw new Error(`[storage] unknown disk '${diskName}'. Available: local, s3.`)

  cache[diskName] = resolved
  return resolved
}

/** The default disk's name — handy for logging which target is active. */
export function defaultDiskName(): string {
  return filesystems.default || 'local'
}
