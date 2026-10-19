import { beforeEach, describe, expect, it } from 'bun:test'
import { stashHandoff, takeHandoff } from '../../resources/functions/native-handoff'

/**
 * The handoff rides a SHARED key, so these tests are mostly about the id
 * guard: the thing standing between "paints instantly" and "paints the wrong
 * judge's name".
 */

function fakeStore(): Map<string, unknown> {
  const kv = new Map<string, unknown>()
  ;(globalThis as any).craft = {
    snapshots: {
      get: (k: string) => kv.get(k),
      set: (k: string, v: unknown) => void kv.set(k, v),
    },
  }
  return kv
}

describe('handoff', () => {
  beforeEach(() => {
    delete (globalThis as any).craft
  })

  it('hands the row to the screen opened for that id', () => {
    fakeStore()
    stashHandoff('judge', 7, { id: 7, name: 'Ann L. Aiken' })
    expect(takeHandoff('judge', 7)).toEqual({ id: 7, name: 'Ann L. Aiken' })
  })

  it('refuses a handoff meant for a different id', () => {
    // Two opens in flight: the loser must not paint the winner's judge.
    fakeStore()
    stashHandoff('judge', 7, { id: 7, name: 'Ann L. Aiken' })
    expect(takeHandoff('judge', 8)).toBeNull()
  })

  it('keeps only the latest, so browsing cannot grow the store', () => {
    const kv = fakeStore()
    stashHandoff('judge', 1, { name: 'One' })
    stashHandoff('judge', 2, { name: 'Two' })
    stashHandoff('judge', 3, { name: 'Three' })
    expect(kv.size).toBe(1)
    expect(takeHandoff('judge', 3)).toEqual({ name: 'Three' })
    expect(takeHandoff('judge', 1)).toBeNull()
  })

  it('keeps kinds apart', () => {
    fakeStore()
    stashHandoff('judge', 5, { name: 'Judge' })
    expect(takeHandoff('court', 5)).toBeNull()
  })

  it('is null when nothing was stashed', () => {
    fakeStore()
    expect(takeHandoff('judge', 5)).toBeNull()
  })

  it('is null for id 0, which is "the route gave us nothing"', () => {
    fakeStore()
    stashHandoff('judge', 0, { name: 'Nobody' })
    expect(takeHandoff('judge', 0)).toBeNull()
  })

  it('survives a malformed envelope rather than throwing', () => {
    const kv = fakeStore()
    kv.set('handoff.judge', 'not an envelope')
    expect(takeHandoff('judge', 7)).toBeNull()
  })

  it('survives a store that throws', () => {
    ;(globalThis as any).craft = {
      snapshots: {
        get: () => { throw new Error('no store') },
        set: () => { throw new Error('no store') },
      },
    }
    expect(() => stashHandoff('judge', 1, { name: 'x' })).not.toThrow()
    expect(takeHandoff('judge', 1)).toBeNull()
  })

  it('no-ops outside the native runtime, where there is no craft global', () => {
    expect(() => stashHandoff('judge', 1, { name: 'x' })).not.toThrow()
    expect(takeHandoff('judge', 1)).toBeNull()
  })
})
