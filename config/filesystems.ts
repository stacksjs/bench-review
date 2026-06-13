import type { FileSystemConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **File System Configuration**
 *
 * This configuration defines all of your File System options. Because Stacks is fully-typed, you may
 * hover any of the options below and the definitions will be provided. In case you
 * have any questions, feel free to reach out via Discord or GitHub Discussions.
 *
 * `default` is the disk the app storage facade (app/Storage/disk.ts) writes to
 * unless a disk is named explicitly — flip it with `FILESYSTEM_DISK` in `.env`
 * (`local` | `s3`). S3 settings live in the `s3` export below.
 */
export default {
  default: env.FILESYSTEM_DISK || 'local',

  disks: {
    local: {
      driver: 'local',
      root: 'storage',
    },

    public: {
      driver: 'public',
      root: 'storage/public',
    },

    private: {
      driver: 'private',
      root: 'storage/private',
      visibility: 'private',
    },

    efs: {
      driver: 'local',
      root: '/mnt/efs',
    },

    s3: {
      driver: 's3',
      root: 's3',
    },
  },
} satisfies FileSystemConfig

/**
 * S3 settings for the app storage facade (app/Storage/disk.ts).
 *
 * Kept as a separate export because the typed `FileSystemConfig` above only
 * models `{ driver, root }` per disk — this carries the bucket/region/
 * credentials the S3 driver actually needs. Every value reads from the
 * environment, so you can drive S3 entirely from `.env` (the common case) OR
 * hardcode here. Leave `bucket` empty to keep S3 inert (the `local` disk is
 * used until you opt in via `FILESYSTEM_DISK=s3`).
 *
 * `endpoint` lets you point at S3-compatible stores (Cloudflare R2, MinIO,
 * DigitalOcean Spaces). `publicUrl` is the CDN/base URL prepended to object
 * keys when building a public link — set it to your bucket's public domain
 * (or a CloudFront/R2 custom domain); falls back to the virtual-hosted AWS URL.
 * Credentials left blank fall through to Bun's S3 credential chain (the same
 * AWS_* env vars), so you rarely need to set them twice.
 */
export const s3 = {
  bucket: env.AWS_BUCKET || '',
  region: env.AWS_DEFAULT_REGION || 'us-east-1',
  prefix: env.AWS_S3_PREFIX || '',
  endpoint: env.AWS_ENDPOINT || '',
  publicUrl: env.AWS_URL || '',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
  },
}
