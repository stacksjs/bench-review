import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import correctionAction from '../../app/Actions/Judges/SubmitJudgeCorrectionAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Judge correction intake — bench-review#50.
 *
 * The FAQ has promised a correction link on every judge profile since launch,
 * and it existed on no component; the contact form's "Judge data correction"
 * option posts to /api/contact, which has no route. So the only channel this
 * site advertises for fixing a record about a named, sitting judge has always
 * gone nowhere — on first-party data, where being wrong is the exposure.
 */

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_submissions')
  raw.run('DELETE FROM judges')
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (5, \'Judge With A Typo\', datetime(\'now\'))')
  raw.close()
}

function submissions(): any[] {
  const raw = openTestDatabase()
  const rows = raw.query('SELECT kind, judge_id, judge_name, details, source_url, submitter_email, status FROM judge_submissions').all() as any[]
  raw.close()
  return rows
}

async function report(judgeId: string, fields: Record<string, unknown>): Promise<number> {
  const req = {
    url: `http://localhost:4008/api/judges/${judgeId}/correction`,
    method: 'POST',
    params: { id: judgeId },
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (correctionAction as any).handle())
  return typeof res?.status === 'number' ? res.status : 200
}

const GOOD = 'The courthouse is wrong — this judge moved to the Eastern District in 2023.'

describe('judge correction intake', () => {
  beforeEach(seed)

  test('a report lands in the moderation queue attached to the judge', async () => {
    expect(await report('5', { details: GOOD, sourceUrl: 'https://courts.example.gov/j', submitterEmail: 'Reader@Example.test' })).toBe(201)

    const [row] = submissions()
    expect(row.kind).toBe('correction')
    // The attachment is the whole point: the dead contact-form route delivered
    // reports with no way to tell which of 2,740 profiles they were about.
    expect(row.judge_id).toBe(5)
    expect(row.judge_name).toBe('Judge With A Typo')
    expect(row.details).toBe(GOOD)
    expect(row.submitter_email).toBe('reader@example.test')
    expect(row.status).toBe('pending')
  })

  test('an email address is optional', async () => {
    // Demanding one from somebody correcting a public record discourages the
    // reports most worth having.
    expect(await report('5', { details: GOOD })).toBe(201)
    expect(submissions()[0].submitter_email).toBeNull()
  })

  test('an empty or token report is refused', async () => {
    expect(await report('5', {})).toBe(422)
    expect(await report('5', { details: 'wrong' })).toBe(422)
    expect(submissions().length).toBe(0)
  })

  test('a non-http source and a bad email are refused', async () => {
    expect(await report('5', { details: GOOD, sourceUrl: 'javascript:alert(1)' })).toBe(422)
    expect(await report('5', { details: GOOD, submitterEmail: 'not-an-email' })).toBe(422)
    expect(submissions().length).toBe(0)
  })

  test('a report about a judge that does not exist is a 404', async () => {
    expect(await report('99999', { details: GOOD })).toBe(404)
    expect(submissions().length).toBe(0)
  })
})
