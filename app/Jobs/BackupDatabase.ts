import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { log } from '@stacksjs/logging'
import { Job } from '@stacksjs/queue'
import { disk } from '../Storage/disk'

/**
 * Daily SQLite backup (bench-review#55).
 *
 * Until this existed there was no copy of anything. The only database held
 * every review, every moderation decision and every credential claim — records
 * that are irreplaceable and, in the case of `moderation_logs`, the evidence
 * that the site handled a takedown or a threat correctly. One disk failure
 * ended all of it.
 *
 * ── Why `VACUUM INTO` and not a file copy ───────────────────────────────────
 * Copying `stacks.sqlite` while the app is running produces a file that may be
 * torn: the copy can catch pages mid-write, and the `-wal` sidecar holding
 * committed-but-not-yet-checkpointed transactions is a separate file that a
 * naive copy misses entirely. The result restores as a corrupt database, or
 * worse, as a subtly stale one.
 *
 * `VACUUM INTO` takes a read transaction and writes a NEW, fully checkpointed,
 * defragmented database. It is the method SQLite's own documentation gives for
 * backing up a live database, it needs no extra dependency, and the output is
 * a plain .sqlite file that restores by being copied into place — which is the
 * property that matters at 3am.
 *
 * ── Where it goes ───────────────────────────────────────────────────────────
 * Through the storage facade, so `FILESYSTEM_DISK=s3` makes these offsite with
 * no code change. On the default local disk they land under `storage/backups/`
 * — same machine, so NOT a real backup, which the job says out loud rather
 * than letting a green log line imply safety it has not got.
 */

/** Keep this many local backups. Offsite retention is the bucket's lifecycle policy, not ours. */
const KEEP_LOCAL = 7

function dbPath(): string {
  return process.env.DB_DATABASE || 'database/stacks.sqlite'
}

/** `bench-2026-10-15T0300.sqlite` — UTC, and sorts chronologically as a plain string. */
export function backupName(now: Date): string {
  return `bench-${now.toISOString().slice(0, 16).replace(':', '')}.sqlite`
}

/**
 * Prune old local backups. Only ever touches files this job wrote — matched by
 * the `bench-*.sqlite` prefix — so pointing BACKUP_DIR at a populated
 * directory cannot delete somebody else's data.
 */
export function pruneLocal(dir: string, keep: number): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir).filter(f => /^bench-.*\.sqlite$/.test(f))
  }
  catch {
    return []
  }
  const sorted = entries.sort().reverse()
  const stale = sorted.slice(keep)
  for (const f of stale) {
    try {
      rmSync(join(dir, f), { force: true })
    }
    catch (err) {
      log.warn(`[backup] could not remove old backup ${f}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return stale
}

export default new Job({
  name: 'BackupDatabase',
  description: 'VACUUM INTO a timestamped SQLite snapshot and ship it to the configured disk',
  queue: 'default',
  tries: 2,
  backoff: 30,

  handle: async () => {
    const source = dbPath()
    const now = new Date()
    const name = backupName(now)

    // Staged locally first even when the destination is S3: VACUUM INTO writes
    // to a path, not a stream, so there has to be a file before anything can
    // be uploaded.
    const stageDir = process.env.BACKUP_DIR || 'storage/backups'
    mkdirSync(stageDir, { recursive: true })
    const stagePath = join(stageDir, name)

    // VACUUM INTO refuses to overwrite, which is the behaviour we want: a
    // second run in the same minute should fail loudly rather than silently
    // replace the first.
    const db = new Database(source, { readonly: true })
    try {
      db.run(`VACUUM INTO '${stagePath.replace(/'/g, '\'\'')}'`)
    }
    finally {
      db.close()
    }

    const bytes = statSync(stagePath).size
    if (bytes === 0)
      throw new Error(`[backup] ${name} came out empty — refusing to report a successful backup.`)

    const store = disk()
    let destination = stagePath
    if (store.name !== 'local') {
      const body = await readFile(stagePath)
      const put = await store.put(`backups/${name}`, body)
      destination = put.url
    }

    const pruned = pruneLocal(stageDir, KEEP_LOCAL)

    // Said plainly, because a backup on the same disk as the thing it is
    // backing up is a convenience, not a disaster-recovery story, and a log
    // line that just says "backup complete" invites believing otherwise.
    if (store.name === 'local')
      log.warn(`[backup] wrote ${name} (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${stageDir} — LOCAL DISK, same machine as the database. Set FILESYSTEM_DISK=s3 for an offsite copy.`)
    else
      log.info(`[backup] wrote ${name} (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${destination}`)

    return { name, bytes, destination, offsite: store.name !== 'local', pruned: pruned.length }
  },
})
