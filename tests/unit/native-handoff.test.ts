import { describe, expect, it } from 'bun:test'
import { handoffFromParams, handoffQuery, judgeFromHandoff } from '../../resources/functions/native-handoff'

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
    expect(handoffFromParams({ id: '1', hname: 'Ann L. Aiken', hcourt: 'District Court' }))
      .toEqual({ name: 'Ann L. Aiken', court: 'District Court' })
  })

  it('round-trips a photo URL unchanged', () => {
    const photo = 'https://ui-avatars.com/api/?name=Ann%20L.&background=1f2937&bold=true'
    const key = handoffQuery({ photo }).slice('?hphoto='.length)
    expect(handoffFromParams({ hphoto: decodeURIComponent(key) })?.photo).toBe(photo)
  })

  it('is null when the route carries no handoff', () => {
    // "Nothing was handed over, fetch it" has to be distinguishable from
    // "a name was handed over and it is empty".
    expect(handoffFromParams({ id: '1' })).toBeNull()
    expect(handoffFromParams({})).toBeNull()
    expect(handoffFromParams(null)).toBeNull()
    expect(handoffFromParams(undefined)).toBeNull()
  })

  it('ignores blank values rather than painting an empty name', () => {
    expect(handoffFromParams({ hname: '   ' })).toBeNull()
  })

  it('does not pick up the route params it sits beside', () => {
    expect(handoffFromParams({ id: '7', name: 'not a handoff', path: '/judges/7' })).toBeNull()
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
