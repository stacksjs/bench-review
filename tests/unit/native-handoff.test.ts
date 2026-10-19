import { describe, expect, it } from 'bun:test'
import { COURT_FIELDS, courtFromHandoff, handoffFromParams, handoffQuery, JUDGE_FIELDS, judgeFromHandoff } from '../../resources/functions/native-handoff'

/**
 * The handoff rides the URL because the two store-shaped alternatives both
 * fail quietly on device — see the module header. These tests pin the
 * encoding, and in particular that a value survives the round trip intact:
 * the one field that matters most is a photo URL, which is itself full of
 * `&` and `=`.
 */

describe('handoffQuery', () => {
  it('encodes the fields that have a value', () => {
    expect(handoffQuery({ name: 'Ann L. Aiken', court: 'District Court' }))
      .toBe('?hname=Ann%20L.%20Aiken&hcourt=District%20Court')
  })

  it('leaves out what is empty rather than sending blanks', () => {
    expect(handoffQuery({ name: 'Ann', photo: '', court: '   ' })).toBe('?hname=Ann')
  })

  it('is empty when nothing is known, so the path stays clean', () => {
    expect(handoffQuery({})).toBe('')
    expect(handoffQuery({ name: '', photo: '' })).toBe('')
  })

  it('escapes a URL value so its own query does not leak into the path', () => {
    // The photo is a URL with `&` and `=` in it. Unescaped, `&background=...`
    // would arrive as a separate route param.
    const photo = 'https://ui-avatars.com/api/?name=Ann&size=256&background=1f2937'
    const query = handoffQuery({ photo })
    expect(query).not.toContain('&background=')
    expect(query).toBe(`?hphoto=${encodeURIComponent(photo)}`)
  })

  it('prefixes every key, so none can collide with a route param', () => {
    // `route.params` is one flat object: an unprefixed `name` or `id` would
    // sit beside the path's own `:id`.
    const query = handoffQuery({ name: 'x', photo: 'y', court: 'z', where: 'w' })
    for (const key of query.slice(1).split('&').map(p => p.split('=')[0]))
      expect(key.startsWith('h')).toBe(true)
  })
})

describe('handoffFromParams', () => {
  it('reads back what was written, decoded by the router', () => {
    // The runtime decodes, so params arrive as the original strings.
    expect(handoffFromParams({ id: '1', hname: 'Ann L. Aiken', hcourt: 'District Court' }, JUDGE_FIELDS))
      .toEqual({ name: 'Ann L. Aiken', court: 'District Court' })
  })

  it('round-trips a photo URL unchanged', () => {
    const photo = 'https://ui-avatars.com/api/?name=Ann%20L.&background=1f2937&bold=true'
    const key = handoffQuery({ photo }).slice('?hphoto='.length)
    expect(handoffFromParams<any>({ hphoto: decodeURIComponent(key) }, JUDGE_FIELDS)?.photo).toBe(photo)
  })

  it('is null when the route carries no handoff', () => {
    // "Nothing was handed over, fetch it" has to be distinguishable from
    // "a name was handed over and it is empty".
    expect(handoffFromParams({ id: '1' }, JUDGE_FIELDS)).toBeNull()
    expect(handoffFromParams({}, JUDGE_FIELDS)).toBeNull()
    expect(handoffFromParams(null, JUDGE_FIELDS)).toBeNull()
    expect(handoffFromParams(undefined, JUDGE_FIELDS)).toBeNull()
  })

  it('ignores blank values rather than painting an empty name', () => {
    expect(handoffFromParams({ hname: '   ' }, JUDGE_FIELDS)).toBeNull()
  })

  it('does not pick up the route params it sits beside', () => {
    expect(handoffFromParams({ id: '7', name: 'not a handoff', path: '/judges/7' }, JUDGE_FIELDS)).toBeNull()
  })
})

describe('judgeFromHandoff', () => {
  it('shapes it like the judge endpoint, so the screen reads one shape', () => {
    expect(judgeFromHandoff({ name: 'Ann', photo: 'p.png', court: 'District Court', where: 'OR' }))
      .toEqual({ name: 'Ann', photo: 'p.png', court: { name: 'District Court' }, location: 'OR' })
  })

  it('leaves court null when there is none, which is what the screen branches on', () => {
    expect(judgeFromHandoff({ name: 'Ann' })?.court).toBeNull()
  })

  it('is null for no handoff', () => {
    expect(judgeFromHandoff(null)).toBeNull()
  })
})

describe('a courthouse handoff', () => {
  it('round-trips the row the directory already has', () => {
    const query = handoffQuery({ name: 'District Court, D. Oregon', where: 'Portland, OR', judges: 12, reviews: 48, rating: 4.2 })
    const params: Record<string, string> = { id: '1' }
    for (const pair of query.slice(1).split('&')) {
      const [k, v] = pair.split('=')
      params[k] = decodeURIComponent(v)
    }
    expect(courtFromHandoff(handoffFromParams(params, COURT_FIELDS))).toEqual({
      name: 'District Court, D. Oregon',
      city: 'Portland, OR',
      state: '',
      active_judges: 12,
      total_reviews: 48,
      avg_rating: 4.2,
    })
  })

  it('keeps a missing rating null, not zero', () => {
    // "No published reviews yet" is a state the screen shows differently from
    // an average of zero, which no review can produce.
    const court = courtFromHandoff(handoffFromParams({ hname: 'A court' }, COURT_FIELDS))
    expect(court?.avg_rating).toBeNull()
    expect(court?.total_reviews).toBeNull()
  })

  it('reads only its own fields, not the judge handoff\'s', () => {
    expect(handoffFromParams({ hphoto: 'p.png' }, COURT_FIELDS)).toBeNull()
  })

  it('is null for no handoff', () => {
    expect(courtFromHandoff(null)).toBeNull()
  })
})
