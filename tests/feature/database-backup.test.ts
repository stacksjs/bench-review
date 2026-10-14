import { Database } from 'bun:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import backupJob from '../../app/Jobs/BackupDatabase'
import { backupName, pruneLocal } from '../../app/Jobs/BackupDatabase'
import { openTestDatabase, TEST_DB_PATH } from '../helpers/database'

/**
 * Database backups — bench-review#55.
 *
 * There was no copy of anything. The only database holds every review, every
 * moderation decision and every credential claim; `moderation_logs` in
 * particular is the evidence that a takedown or a threat report was handled
 * correctly. One disk failure ended all of it.
 *
 * The property that actually matters is not "a file appeared" — it is that the
 * file RESTORES. A backup nobody has restored is a hypothesis, so this opens
 * the output and compares it against the source.
 */

const STAGE = 'tests/temp/backups'

function clean(): void {
  rmSync(STAGE, { recursive: true, force: true })
  mkdirSync(STAGE, { recursive: true })
}

describe('database backup', () => {
  beforeEach(() => {
    clean()
    process.env.BACKUP_DIR = STAGE
    process.env.DB_DATABASE = TEST_DB_PATH
    // Seed something recognisable so the restore check has content to compare.
    const raw = openTestDatabase()
    raw.run('DELETE FROM judges')
    raw.run('INSERT INTO judges (id, name, created_at) VALUES (4100, \'Backup Probe\', datetime(\'now\')), (4101, \'Second Judge\', datetime(\'now\'))')
    raw.close()
  })

  afterEach(() => {
    rmSync(STAGE, { recursive: true, force: true })
    delete process.env.BACKUP_DIR
  })

  test('the snapshot restores, with the same tables and the same rows', async () => {
    const result = await (backupJob as any).handle()

    expect(existsSync(result.destination)).toBe(true)
    expect(result.bytes).toBeGreaterThan(0)

    const source = new Database(TEST_DB_PATH, { readonly: true })
    const restored = new Database(result.destination, { readonly: true })
    try {
      // Not corrupt. This is the check a torn file-copy of a live database
      // fails, which is the whole reason the job uses VACUUM INTO.
      expect((restored.query('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok')

      const tableCount = (d: Database): number =>
        Number((d.query('SELECT COUNT(*) AS c FROM sqlite_master WHERE type = \'table\'').get() as any).c)
      expect(tableCount(restored)).toBe(tableCount(source))

      const judges = restored.query('SELECT id, name FROM judges ORDER BY id').all() as any[]
      expect(judges).toHaveLength(2)
      expect(judges[0].name).toBe('Backup Probe')
    }
    finally {
      source.close()
      restored.close()
    }
  })

  test('a write after the backup is NOT in it — the snapshot is a point in time', async () => {
    const result = await (backupJob as any).handle()

    const raw = openTestDatabase()
    raw.run('INSERT INTO judges (id, name, created_at) VALUES (4102, \'Added Later\', datetime(\'now\'))')
    raw.close()

    const restored = new Database(result.destination, { readonly: true })
    try {
      const names = (restored.query('SELECT name FROM judges').all() as any[]).map(r => r.name)
      expect(names).toContain('Backup Probe')
      expect(names).not.toContain('Added Later')
    }
    finally {
      restored.close()
    }
  })

  test('rows still sitting in the -wal are captured', async () => {
    // The reason this job uses VACUUM INTO rather than copying the file.
    // In WAL mode a committed row can live in `stacks.sqlite-wal` and not yet
    // be in the main database file, so copying that file alone silently loses
    // it — the backup restores clean and STALE, which is worse than failing.
    //
    // On a database of its OWN, deliberately. `PRAGMA journal_mode = WAL` is
    // persistent: it is written into the file, not scoped to the connection.
    // Setting it on the shared test database leaked into every later test —
    // locally that was invisible because the file was already in WAL mode, and
    // CI, which builds it fresh, failed eight unrelated judge-admin tests with
    // SQLITE_BUSY_SNAPSHOT.
    const scratch = join(STAGE, 'wal-probe.sqlite')
    copyFileSync(TEST_DB_PATH, scratch)
    process.env.DB_DATABASE = scratch

    const live = new Database(scratch)
    live.run('PRAGMA journal_mode = WAL')
    live.run('DELETE FROM judges')
    live.run('INSERT INTO judges (id, name, created_at) VALUES (4199, \'Uncheckpointed\', datetime(\'now\'))')

    let result: any
    try {
      result = await (backupJob as any).handle()
    }
    finally {
      live.close()
      process.env.DB_DATABASE = TEST_DB_PATH
    }

    const restored = new Database(result.destination, { readonly: true })
    try {
      const names = (restored.query('SELECT name FROM judges').all() as any[]).map(r => r.name)
      expect(names).toContain('Uncheckpointed')
    }
    finally {
      restored.close()
    }
  })

  test('the name sorts chronologically as a plain string', () => {
    const earlier = backupName(new Date('2026-10-15T03:00:00Z'))
    const later = backupName(new Date('2026-10-15T04:00:00Z'))
    const nextDay = backupName(new Date('2026-10-16T01:00:00Z'))

    // Retention sorts by filename, so lexical order has to equal time order —
    // otherwise pruning deletes the wrong week.
    expect([nextDay, earlier, later].sort()).toEqual([earlier, later, nextDay])
    expect(earlier).toBe('bench-2026-10-15T0300.sqlite')
  })

  test('pruning keeps the newest and never touches files it did not write', () => {
    for (const n of ['bench-2026-10-01T0300.sqlite', 'bench-2026-10-02T0300.sqlite', 'bench-2026-10-03T0300.sqlite'])
      writeFileSync(join(STAGE, n), 'x')
    // Somebody else's file, in the same directory.
    writeFileSync(join(STAGE, 'production-dump.sqlite'), 'precious')

    const pruned = pruneLocal(STAGE, 2)

    expect(pruned).toEqual(['bench-2026-10-01T0300.sqlite'])
    const left = readdirSync(STAGE).sort()
    expect(left).toContain('bench-2026-10-03T0300.sqlite')
    expect(left).toContain('bench-2026-10-02T0300.sqlite')
    // The prefix match is what stops BACKUP_DIR pointed at a populated
    // directory from deleting data this job never created.
    expect(left).toContain('production-dump.sqlite')
  })
})
