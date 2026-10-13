import { Auth } from '@stacksjs/auth'
import { runWithRequest } from '@stacksjs/router'
import { beforeEach, describe, expect, test } from 'bun:test'
import createOpinion from '../../app/Actions/Admin/Opinions/CreateJudgeOpinionAction'
import { openTestDatabase } from '../helpers/database'

/**
 * Opinion provenance — bench-review#50.
 *
 * "Recent Rulings" are statements this site publishes about how a named,
 * sitting judge decided a real case. `source_url` was nullable and nothing
 * checked it, so an admin could publish an unsourced factual claim about a
 * person's professional conduct — first-party content a reader cannot check
 * and CDA 230 does not cover.
 */

const ADMIN_ID = 8901

function seed(): number {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judge_opinions')
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM users WHERE id = ?', [ADMIN_ID])
  raw.run('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime(\'now\'))', [ADMIN_ID, 'Mod', 'opinion-mod@example.test'])
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (1, \'A Judge\', datetime(\'now\'))')
  raw.close()
  return 1
}

function opinionCount(): number {
  const raw = openTestDatabase()
  const row = raw.query('SELECT COUNT(*) AS c FROM judge_opinions').get() as { c: number }
  raw.close()
  return Number(row.c)
}

async function create(fields: Record<string, unknown>): Promise<number> {
  const req = {
    url: 'http://localhost:4008/api/admin/judges/1/opinions',
    method: 'POST',
    params: { id: '1' },
    query: fields,
    get: (k: string) => (fields as any)[k],
    all: () => fields,
  }
  const res: any = await runWithRequest(req as any, () => (createOpinion as any).handle())
  return typeof res?.status === 'number' ? res.status : 200
}

describe('judge opinion provenance', () => {
  beforeEach(() => {
    seed()
    ;(Auth as any).user = async () => ({ id: ADMIN_ID })
  })

  test('a ruling with no source and no citation is refused', async () => {
    expect(await create({ judge_id: 1, case_name: 'Doe v. Roe' })).toBe(422)
    expect(opinionCount()).toBe(0)
  })

  test('a source URL is enough', async () => {
    expect(await create({ judge_id: 1, case_name: 'Doe v. Roe', source_url: 'https://www.courtlistener.com/opinion/1/' })).toBe(201)
    expect(opinionCount()).toBe(1)
  })

  test('a citation alone is enough', async () => {
    // A reported case is traceable from `410 U.S. 113` without a link, so
    // requiring a URL specifically would block legitimate entries.
    expect(await create({ judge_id: 1, case_name: 'Doe v. Roe', citation: '410 U.S. 113' })).toBe(201)
    expect(opinionCount()).toBe(1)
  })

  test('a non-http source is still refused', async () => {
    expect(await create({ judge_id: 1, case_name: 'Doe v. Roe', source_url: 'javascript:alert(1)' })).toBe(422)
    expect(opinionCount()).toBe(0)
  })
})
