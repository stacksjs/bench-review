import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

/**
 * Every native screen is visited by some e2e flow (bench-review#81).
 *
 * JudgeEducation shipped, was wired into `nativeScreens`, and no flow ever
 * opened it. A screen nothing visits is not covered badly — it is not covered
 * at all: it could render blank, crash on mount, or have been dropped from
 * the route map entirely, and a full green run would say nothing. It was
 * found by listing screens by hand against the flows, which is exactly the
 * kind of audit nobody repeats.
 *
 * ## Why this is a declaration and not a detector
 *
 * A test cannot tell from the outside whether a flow really exercised a
 * screen. Matching flows against the ids a screen happens to own looks
 * mechanical but lies in both directions: `judge-education` is a BUTTON on
 * the judge screen, so a flow that only tapped it would mark the education
 * screen covered without ever asserting anything that rendered there, while
 * a screen whose ids are all conditional — `education-retry` only exists
 * after a failure — looks uncovered however thoroughly it is tested.
 *
 * So the map below is written by hand and this test guards the two things it
 * can actually check: that no screen is missing from it, and that every flow
 * it names exists. Adding a screen to `config/mobile.ts` then fails here
 * until someone says which flow visits it — a decision, made once, by whoever
 * knows what the screen does.
 */

const projectRoot = join(import.meta.dir, '../..')

/** Which flow visits each screen, and what it is there to see. */
const VISITED_BY: Record<string, { flow: string, covers: string }> = {
  Reviews: { flow: '01-cold-start.yaml', covers: 'the feed on a cold start' },
  Judges: { flow: '02-navigation.yaml', covers: 'the directory tab' },
  CourtHouses: { flow: '02-navigation.yaml', covers: 'the courthouse tab' },
  CourtHouse: { flow: '02-navigation.yaml', covers: 'a courthouse pushing its filtered bench' },
  Profile: { flow: '02-navigation.yaml', covers: 'the signed-out profile' },
  Judge: { flow: '06-follow.yaml', covers: 'following and unfollowing from the judge screen' },
  Review: { flow: '07-write-review.yaml', covers: 'writing a review, refused and accepted' },
  Login: { flow: '07-write-review.yaml', covers: 'signing in from a screen that needed a session' },
  ReviewComments: { flow: '08-post-comment.yaml', covers: 'posting into a thread' },
  ReviewDetail: { flow: '10-review-page.yaml', covers: 'one review in full' },
  JudgeOpinions: { flow: '12-paging-deep.yaml', covers: 'three pages of opinions' },
  JudgeEducation: { flow: '13-education.yaml', covers: 'a recorded history, and the empty one most judges have' },
}

function nativeScreenNames(): string[] {
  const source = readFileSync(join(projectRoot, 'config/mobile.ts'), 'utf8')
  const block = source.match(/const nativeScreens: Record<string, string> = \{(.*?)\n\}/s)
  if (!block)
    throw new Error('nativeScreens could not be read from config/mobile.ts — its shape changed.')
  // Two paths reach Review; the set is what matters, not the count.
  return [...new Set([...block[1].matchAll(/'[^']+':\s*'([^']+)'/g)].map(m => m[1]))]
}

describe('every native screen is visited by a flow', () => {
  const screens = nativeScreenNames()

  test('config/mobile.ts is still readable', () => {
    // A guard that silently found nothing would pass forever.
    expect(screens.length).toBeGreaterThan(10)
    expect(screens).toContain('JudgeEducation')
  })

  test('no screen is missing from the map', () => {
    const unvisited = screens.filter(name => !VISITED_BY[name])
    expect(unvisited).toEqual([])
  })

  test('the map names no screen that no longer exists', () => {
    const stale = Object.keys(VISITED_BY).filter(name => !screens.includes(name))
    expect(stale).toEqual([])
  })

  test('every flow the map names exists', () => {
    const flows = new Set(readdirSync(join(projectRoot, '.maestro/flows')))
    const missing = Object.entries(VISITED_BY)
      .filter(([, v]) => !flows.has(v.flow))
      .map(([screen, v]) => `${screen} -> ${v.flow}`)
    expect(missing).toEqual([])
  })

  test('every screen has a file to render', () => {
    const files = new Set(readdirSync(join(projectRoot, 'resources/native')))
    const missing = screens.filter(name => !files.has(`${name}.stx`))
    expect(missing).toEqual([])
  })
})
