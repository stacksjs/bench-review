import { beforeEach, describe, expect, test } from 'bun:test'
import { attachJudgeContext, judgeContextFor } from '../../app/Helpers/judgeContext'
import { openTestDatabase } from '../helpers/database'

/**
 * Judge context on review rows — bench-review#50.
 *
 * A review that says only "Brian Curtis Wimes" does not identify anyone: the
 * live directory holds 22 rows across 10 names, and that one is two profiles
 * separated by E.D. versus W.D. Missouri. Reviews are first-party records
 * about named, sitting people, so a reader attributing one to the wrong judge
 * of the same name is the failure this issue was filed about.
 */

function seed(): void {
  const raw = openTestDatabase()
  raw.run('DELETE FROM judges')
  raw.run('DELETE FROM court_houses')
  raw.run('INSERT INTO court_houses (id, name, state, created_at) VALUES (1, \'District Court, E.D. Missouri\', \'MO\', datetime(\'now\')), (2, \'District Court, W.D. Missouri\', \'MO\', datetime(\'now\'))')
  raw.run('INSERT INTO judges (id, name, slug, jurisdiction, state, court_house_id, created_at) VALUES (1, \'Brian Curtis Wimes\', \'brian-curtis-wimes\', \'federal\', \'MO\', 1, datetime(\'now\'))')
  raw.run('INSERT INTO judges (id, name, slug, jurisdiction, state, court_house_id, created_at) VALUES (2, \'Brian Curtis Wimes\', \'brian-curtis-wimes-2\', \'federal\', \'MO\', 2, datetime(\'now\'))')
  // Everything unknown except the name: the hand-seeded shape.
  raw.run('INSERT INTO judges (id, name, created_at) VALUES (3, \'A Bare Judge\', datetime(\'now\'))')
  raw.close()
}

describe('judge context', () => {
  beforeEach(seed)

  test('two same-name judges are told apart by their courthouse', async () => {
    const rows = await attachJudgeContext([{ id: 10, judge_id: 1 }, { id: 11, judge_id: 2 }])

    expect((rows[0] as any).judge.context_line).toBe('District Court, E.D. Missouri · federal · MO')
    expect((rows[1] as any).judge.context_line).toBe('District Court, W.D. Missouri · federal · MO')
    // Same name, different line — which is the entire point.
    expect((rows[0] as any).judge.name).toBe((rows[1] as any).judge.name)
    expect((rows[0] as any).judge.context_line).not.toBe((rows[1] as any).judge.context_line)
  })

  test('absent parts are dropped, not rendered as a placeholder', async () => {
    const [row] = await attachJudgeContext([{ id: 12, judge_id: 3 }])

    // Not "null · null", not "Unknown court" — a judge whose courthouse we do
    // not know should say less, not say something wrong.
    expect((row as any).judge.context_line).toBe('')
    expect((row as any).judge.name).toBe('A Bare Judge')
  })

  test('a review pointing at a judge that no longer exists keeps judge: null', async () => {
    const [row] = await attachJudgeContext([{ id: 13, judge_id: 99999 }])
    // The components branch on this; a placeholder object would render an
    // empty card instead of being skipped.
    expect((row as any).judge).toBeNull()
  })

  test('rows with no judge_id are returned untouched', async () => {
    const rows = await attachJudgeContext([{ id: 14, judge_id: null }])
    expect((rows[0] as any).judge).toBeUndefined()
    expect(await attachJudgeContext([])).toEqual([])
  })

  test('the single-row helper agrees with the batch one', async () => {
    const one = await judgeContextFor(1)
    const [row] = await attachJudgeContext([{ judge_id: 1 }])
    expect(one).toEqual((row as any).judge)
    expect(await judgeContextFor(99999)).toBeNull()
  })
})
