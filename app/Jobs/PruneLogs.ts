import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { log } from '@stacksjs/logging'
import { Job } from '@stacksjs/queue'

/**
 * Delete log files nobody is going to read again (bench-review#55).
 *
 * `storage/logs` grows without limit. On a small instance that is how a disk
 * fills, and a full disk takes SQLite down with it — which is the one failure
 * this app cannot absorb, since the database is the site.
 *
 * Deliberately conservative: it only deletes files whose MTIME is older than
 * the window, only `.log`/`.log.N` files, and only inside the logs directory.
 * It does not touch the file currently being written.
 */

const DEFAULT_DAYS = 30

export default new Job({
  name: 'PruneLogs',
  description: 'Delete log files older than the retention window',
  queue: 'default',
  tries: 1,

  handle: () => {
    const dir = process.env.LOG_DIR || 'storage/logs'
    const days = Number(process.env.LOG_RETENTION_DAYS || DEFAULT_DAYS)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    let entries: string[]
    try {
      entries = readdirSync(dir)
    }
    catch {
      // No logs directory yet — nothing to prune, and not a failure.
      return { removed: 0, dir, days }
    }

    const removed: string[] = []
    for (const name of entries) {
      if (!/\.log(\.\d+)?$/.test(name))
        continue
      const full = join(dir, name)
      try {
        if (statSync(full).mtimeMs >= cutoff)
          continue
        rmSync(full, { force: true })
        removed.push(name)
      }
      catch {
        // A log being written, or one already gone. Either way, skip it.
      }
    }

    if (removed.length)
      log.info(`[prune-logs] removed ${removed.length} log file(s) older than ${days}d from ${dir}`)
    return { removed: removed.length, dir, days }
  },
})
