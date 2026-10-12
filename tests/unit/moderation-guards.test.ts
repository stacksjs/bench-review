import { describe, expect, test } from 'bun:test'
import { isUniqueViolation } from '../../app/Helpers/dbErrors'
import { EMAIL_CATEGORIES, isEmailCategory } from '../../app/Helpers/emailPreferences'
import { normalizeSearchQuery } from '../../app/Helpers/searchDemand'

/**
 * Small guards that decide whether user input reaches a query, whether a
 * duplicate write is an error or a no-op, and how a search is recorded.
 *
 * Each was verified once by a throwaway script while it was being written.
 * That proved it worked that afternoon and protected nothing afterwards —
 * which is the gap these fill. They are pure functions on purpose: no
 * database, no request context, so they run in milliseconds and cannot rot
 * for environmental reasons.
 */

describe('isUniqueViolation', () => {
  // Both check-then-insert paths (compose-draft autosave, review flags) now
  // sit behind a real unique index, so the loser of a race raises instead of
  // writing a duplicate. Recognising that exception is what turns it into a
  // retry or a friendly 200 rather than a 500.
  test('recognises the wording of every driver this app might run on', () => {
    expect(isUniqueViolation(new Error('UNIQUE constraint failed: review_drafts.user_id'))).toBe(true)
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint "x"'))).toBe(true)
    expect(isUniqueViolation(new Error('Duplicate entry \'1\' for key \'review_drafts.user_id\''))).toBe(true)
  })

  test('recognises the constraint class on the error object', () => {
    expect(isUniqueViolation(Object.assign(new Error('boom'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }))).toBe(true)
  })

  // The dangerous direction. Treating an unrelated failure as a duplicate
  // would swallow it and report success to the caller.
  test('does not claim unrelated failures', () => {
    expect(isUniqueViolation(new Error('connection reset'))).toBe(false)
    expect(isUniqueViolation(new Error('no such table: review_flags'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('')).toBe(false)
  })
})

describe('email categories', () => {
  test('accepts only the declared categories', () => {
    for (const c of EMAIL_CATEGORIES)
      expect(isEmailCategory(c.id)).toBe(true)
  })

  // The category reaches `notification_preferences` as a column value, so an
  // allowlist is what keeps caller-supplied text out of a query.
  test('rejects anything else, including injection attempts', () => {
    expect(isEmailCategory('marketing')).toBe(false)
    expect(isEmailCategory('')).toBe(false)
    expect(isEmailCategory('email\' OR 1=1')).toBe(false)
    expect(isEmailCategory(null)).toBe(false)
    expect(isEmailCategory(42)).toBe(false)
  })

  // Every category must have a send site; a switch wired to nothing is worse
  // than no switch. This cannot assert the wiring, but it can assert the
  // shape callers rely on.
  test('every category carries a label and a description', () => {
    expect(EMAIL_CATEGORIES.length).toBeGreaterThan(0)
    for (const c of EMAIL_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.description.length).toBeGreaterThan(0)
    }
  })
})

describe('normalizeSearchQuery', () => {
  // Case and spacing are not meaningful differences between two people
  // looking for the same judge; leaving them distinct splits one backlog
  // entry across several rows.
  test('folds case and collapses whitespace', () => {
    expect(normalizeSearchQuery('  Ann L. AIKEN ')).toBe('ann l. aiken')
    expect(normalizeSearchQuery('ann\t\tl.   aiken')).toBe('ann l. aiken')
  })

  test('caps length so one query cannot write an unbounded row', () => {
    expect(normalizeSearchQuery('x'.repeat(300))).toHaveLength(120)
  })

  test('survives junk input', () => {
    expect(normalizeSearchQuery(undefined as any)).toBe('')
    expect(normalizeSearchQuery(null as any)).toBe('')
    expect(normalizeSearchQuery('   ')).toBe('')
  })
})
