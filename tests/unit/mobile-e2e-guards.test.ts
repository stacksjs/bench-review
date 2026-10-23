import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { handle, handleAsync, resetFailFirst, shouldRefuse } from '../../scripts/mobile-e2e-api'
import { flowTags, wantsFailFirstServer, wantsOfflineServer } from '../../scripts/run-mobile-e2e'
import { isLoopback, resolveMobileServer, serverArgument } from '../../scripts/mobile-target'
import { junitSummary, wantsOfflineServer } from '../../scripts/run-mobile-e2e'

/**
 * Guards around the iOS e2e run — bench-review#81.
 *
 * The suite's job is to fail when the app is wrong. These cover the two ways
 * it could quietly fail to do that: by testing a build pointed somewhere it
 * cannot reach, and by reporting success for a run that executed nothing.
 */

describe('mobile build target', () => {
  test('a phone is refused a loopback server, with the reason', () => {
    // The failure this prevents is near-invisible on a device: the app opens
    // on a dead server and drops to its bundled copy, so the site looks empty
    // rather than misconfigured.
    expect(() => resolveMobileServer('http://localhost:4000', 'device')).toThrow(/cannot reach/i)
    // A simulator shares the Mac's network stack, so the same URL is fine.
    expect(resolveMobileServer('http://localhost:4000', 'simulator')).toBe('http://localhost:4000')
  })

  test('plain http is refused for anything that is not this Mac', () => {
    expect(() => resolveMobileServer('http://benchreview.org', 'simulator')).toThrow(/https/i)
    expect(resolveMobileServer('https://benchreview.org', 'device')).toBe('https://benchreview.org')
  })

  test('a scheme-less value is refused rather than guessed at', () => {
    // The generator used to prepend https:// silently, which turned a typo
    // into a build pointed at a host nobody chose.
    expect(() => resolveMobileServer('localhost:4000', 'simulator')).toThrow(/absolute/i)
    expect(() => resolveMobileServer('ftp://example.com', 'simulator')).toThrow(/absolute/i)
  })

  test('the default is production', () => {
    expect(resolveMobileServer(undefined, 'device')).toBe('https://benchreview.org')
    expect(resolveMobileServer('   ', 'device')).toBe('https://benchreview.org')
  })

  test('loopback detection covers the three spellings', () => {
    for (const host of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/'])
      expect(isLoopback(new URL(host))).toBe(true)
    expect(isLoopback(new URL('https://benchreview.org/'))).toBe(false)
  })

  test('--server is read in both spellings and refuses an empty value', () => {
    expect(serverArgument(['--server=http://localhost:4000'])).toBe('http://localhost:4000')
    expect(serverArgument(['--server', 'http://localhost:4000'])).toBe('http://localhost:4000')
    expect(serverArgument(['--flow=01'])).toBeUndefined()
    expect(() => serverArgument(['--server', '--flow=01'])).toThrow()
  })
})

describe('maestro report reading', () => {
  test('a run that executed nothing is not a pass', () => {
    // Maestro exits 0 when it matches no flows. Reading tests="0" as success
    // is how a suite reports green while testing nothing at all.
    expect(junitSummary('<testsuites tests="0" failures="0"/>')).toEqual({ tests: 0, failures: 0 })
  })

  test('failures and errors both count as failures', () => {
    expect(junitSummary('<testsuites tests="3" failures="1" errors="0"/>').failures).toBe(1)
    // An errored flow (a crash, a missing element) is not a pass either.
    expect(junitSummary('<testsuites tests="3" failures="0" errors="2"/>').failures).toBe(2)
    expect(junitSummary('<testsuites tests="4" failures="0" errors="0"/>')).toEqual({ tests: 4, failures: 0 })
  })
})

describe('which flows need the server stopped', () => {
  const flow = (tags: string): string => `appId: x\nname: n\ntags:\n${tags}---\n- launchApp\n`

  test('the tag is read from the flow, not from its filename', () => {
    expect(wantsOfflineServer(flow('  - mobile\n  - offline\n'))).toBe(true)
    expect(wantsOfflineServer(flow('  - mobile\n  - smoke\n'))).toBe(false)
  })

  test('a tag in the BODY does not count', () => {
    // Only the front matter declares what a flow needs. A step that happens
    // to mention the word must not switch the server off under every flow
    // that talks about being offline — including the ones asserting that the
    // offline state is ABSENT.
    const body = 'appId: x\nname: n\ntags:\n  - smoke\n---\n- assertNotVisible: "offline"\n  - offline\n'
    expect(wantsOfflineServer(body)).toBe(false)
  })

  test('the offline flow in this repo is actually tagged', () => {
    // The guard above is only worth having if the flow it protects carries
    // the tag. Untagged, 04 would run with the fixture UP and assert offline
    // copy that never appears — a red suite, but for the wrong reason, and
    // the opposite mistake (asserting it is absent) would pass silently.
    const source = readFileSync(join(import.meta.dir, '../../.maestro/flows/04-offline.yaml'), 'utf8')
    expect(wantsOfflineServer(source)).toBe(true)
  })
})

describe('the e2e fixture api', () => {
  const get = (path: string): any => {
    const response = handle(new Request(`http://localhost/api${path}`))
    return { status: response.status, body: response.json() }
  }

  test('the directory answers a bare array, the paged endpoints an envelope', async () => {
    // The screens read these differently, and the shapes are not
    // interchangeable: a directory handed an envelope renders nothing.
    expect(Array.isArray(await get('/judges').body)).toBe(true)
    expect(await get('/reviews').body).toMatchObject({ current_page: 1, last_page: expect.any(Number) })
  })

  test('a courthouse bench is filtered, and an unknown one is a 404', async () => {
    const bench = get('/court-houses/2/judges')
    expect(bench.status).toBe(200)
    const names = (await bench.body).data.map((j: any) => j.name)
    expect(names).toContain('Fixture C. Cedar')
    expect(names).not.toContain('Fixture A. Alder')
    // Distinct from an empty bench, which is what the real action does.
    expect(get('/court-houses/99/judges').status).toBe(404)
  })

  test('bodies carry the escaped HTML the screens have to decode', async () => {
    // The fixture is only useful for this if it reproduces the shape the bugs
    // were about (dcf1cadb, 74a4397c).
    const feed = await get('/reviews').body
    expect(feed.data[0].content).toContain('&amp;')
    const opinions = await get('/judges/1/opinions').body
    expect(opinions.data[0].summary).toContain('&rsquo;')
  })

  test('the judge with no education is as real as the one with it', async () => {
    expect((await get('/judges/1/education').body).education.length).toBeGreaterThan(0)
    expect((await get('/judges/2/education').body).education).toEqual([])
  })

  test('the fixture spills onto a SECOND page everywhere a pager exists', async () => {
    // `buildPages` returns an empty list for a single page, so a fixture that
    // fits on one renders NO pager and every paging control is unreachable
    // from a flow. The directory sat at exactly 25 against a 25-per-page
    // client slice — the one count that hides the control completely.
    const judges = await get('/judges').body as any[]
    expect(judges.length).toBeGreaterThan(25)

    // The feed is server-paged at 20.
    const feed = await get('/reviews').body
    expect(feed.total).toBeGreaterThan(20)
    expect(feed.last_page).toBeGreaterThan(1)

    // Judge 1's opinions are the only three-page list, which is what makes
    // the numbered buttons worth asserting rather than just Prev/Next.
    const opinions = await get('/judges/1/opinions?page=1&per_page=25').body
    expect(opinions.last_page).toBeGreaterThanOrEqual(3)
  })

  test('a GUEST owns nothing and has liked nothing', async () => {
    // Both fields are computed per request from the caller's session on the
    // real server, and answer false without one. A fixture that ignored auth
    // here would serve a guest and a signed-in reader identical rows, which
    // is precisely what hides the feed's staleness after a sign-in.
    const feed = await get('/reviews').body
    expect(feed.data.every((r: any) => r.is_mine === false)).toBe(true)
    expect(feed.data.every((r: any) => r.liked_by_me === false)).toBe(true)
  })

  test('a SESSION owns its own review and sees what it liked', async () => {
    const response = handle(new Request('http://localhost/api/reviews', {
      headers: { Authorization: 'Bearer fixture-session-token' },
    }))
    const rows = (await response.json() as any).data as any[]
    const mine = rows.filter(r => r.is_mine)
    // Exactly one, so a flow asserting a chip disappeared cannot be fooled by
    // the whole feed failing to render.
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe(1000)
    expect(rows.find(r => r.id === 1001)?.liked_by_me).toBe(true)
  })

  test('the judge screen agrees with the feed about ownership', async () => {
    // They draw the same rows. A review markable helpful in one place and
    // not the other is the kind of difference people notice and cannot
    // explain — and the two screens have drifted once already.
    const guest = await get('/judges/1/reviews').body
    expect(guest.data.every((r: any) => r.is_mine === false)).toBe(true)

    const authed = handle(new Request('http://localhost/api/judges/1/reviews', {
      headers: { Authorization: 'Bearer fixture-session-token' },
    }))
    const rows = (await authed.json() as any).data as any[]
    expect(rows.find(r => r.id === 1000)?.is_mine).toBe(true)
  })

  test('/me/follows answers a bare array, and needs the session', async () => {
    // An envelope here would make the button read "Follow" on a judge the
    // session already follows — the screen does `.includes(id)` on the body.
    const signedOut = handle(new Request('http://localhost/api/me/follows'))
    expect(signedOut.status).toBe(401)

    const response = handle(new Request('http://localhost/api/me/follows', {
      headers: { Authorization: 'Bearer fixture-session-token' },
    }))
    expect(response.status).toBe(200)
    expect(Array.isArray(await response.json())).toBe(true)
  })

  test('the fixture starts with a judge already followed', async () => {
    // So a flow can check the "Following" state on arrival rather than only
    // after tapping — which is the state a default-false screen gets wrong.
    const ids = await handle(new Request('http://localhost/api/me/follows', {
      headers: { Authorization: 'Bearer fixture-session-token' },
    })).json() as number[]
    expect(ids.length).toBeGreaterThan(0)
  })

  test('following is a toggle that states the resulting state', async () => {
    const auth = { Authorization: 'Bearer fixture-session-token' }
    const toggle = (id: number, method: string): Response =>
      handle(new Request(`http://localhost/api/judges/${id}/follow`, { method, headers: auth }))

    expect(await toggle(1, 'POST').json()).toEqual({ ok: true, following: true })
    expect(await toggle(1, 'DELETE').json()).toEqual({ ok: true, following: false })
    // Idempotent, as the real action is: a second follow is not a 409.
    expect(await toggle(1, 'POST').json()).toEqual({ ok: true, following: true })
    expect(await toggle(1, 'POST').json()).toEqual({ ok: true, following: true })
    await toggle(1, 'DELETE')
  })

  test('posting a review accepts what the NATIVE screen sends', async () => {
    // The native screen omits `type`; the web sends it. The action's rule
    // carries no `.required()`, so the router lets an absent value through
    // and `handle()` defaults it. A fixture that demanded the field would
    // fail a screen the real server accepts — which is the failure mode that
    // makes a strict fixture worse than no fixture.
    const response = await handleAsync(new Request('http://localhost/api/reviews', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer fixture-session-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judge_id: 3,
        title: 'Ran a careful hearing',
        content: '<p>Explained every ruling as it was made, and said why.</p>',
        rating: 4,
        anonymized: true,
      }),
    }))
    expect(response.status).toBe(201)
    const body = await response.json() as any
    expect(body.review.type).toBe('neutral')
    // The flag has to survive the trip, or the anonymity toggle is decorative.
    expect(body.review.anonymized).toBe(1)
    // Pending, as every real submission is — it does NOT join the feed.
    expect(body.review.status).toBe('pending')
  })

  test('a body that is only markup is not a review', async () => {
    // `<p></p>` is seven characters of HTML and none of review. Measuring the
    // HTML string rather than the visible text is how a blank-body review got
    // through once.
    const response = await handleAsync(new Request('http://localhost/api/reviews', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer fixture-session-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ judge_id: 1, title: 'Looks fine', content: '<p></p><p>&nbsp;</p>', rating: 5 }),
    }))
    expect(response.status).toBe(422)
    expect((await response.json() as any).error).toMatch(/at least 10 characters of actual text/)
  })

  test('reviewing the same judge twice is a 409, not a second row', async () => {
    const post = (judgeId: number): Promise<Response> => handleAsync(new Request('http://localhost/api/reviews', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer fixture-session-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judge_id: judgeId,
        title: 'Clear and on time',
        content: '<p>Started on time and explained the order of the day.</p>',
        rating: 5,
      }),
    }))
    expect((await post(12)).status).toBe(201)
    const second = await post(12)
    expect(second.status).toBe(409)
    expect((await second.json() as any).error).toMatch(/already reviewed this judge/i)
  })

  test('posting a review refuses what the real route refuses', async () => {
    const auth = { 'Authorization': 'Bearer fixture-session-token', 'Content-Type': 'application/json' }
    const good = { title: 'Clear and on time', content: '<p>Started on time and explained every ruling.</p>', rating: 5 }
    const post = (payload: unknown, headers: Record<string, string> = auth): Promise<Response> =>
      handleAsync(new Request('http://localhost/api/reviews', { method: 'POST', headers, body: JSON.stringify(payload) }))

    expect((await post({ judge_id: 1, ...good }, { 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await post({ judge_id: 9999, ...good })).status).toBe(404)
    expect((await post({ ...good })).status).toBe(422)
    expect((await post({ judge_id: 1, ...good, rating: 0 })).status).toBe(422)
    expect((await post({ judge_id: 1, ...good, title: 'ab' })).status).toBe(422)
  })

  test('following refuses what the real routes refuse', async () => {
    const auth = { Authorization: 'Bearer fixture-session-token' }
    // No session: a 401 the app reads as a spent token.
    expect(handle(new Request('http://localhost/api/judges/1/follow', { method: 'POST' })).status).toBe(401)
    // A judge who is not listed, distinct from a silent success.
    expect(handle(new Request('http://localhost/api/judges/9999/follow', { method: 'POST', headers: auth })).status).toBe(404)
  })
})

describe('refusing the first request, so a retry has something to recover from', () => {
  const url = (path: string): URL => new URL(`http://localhost:4399${path}`)

  test('refuses a path once and then serves it', () => {
    resetFailFirst()
    expect(shouldRefuse(url('/api/judges'), 'GET', true)).toBe(true)
    expect(shouldRefuse(url('/api/judges'), 'GET', true)).toBe(false)
    expect(shouldRefuse(url('/api/judges'), 'GET', true)).toBe(false)
  })

  test('keys on the path, so a second page is not a second refusal', () => {
    resetFailFirst()
    // The screen reads page 1, is refused, retries, then pages onward. If the
    // query counted, every page turn would fail and the pager would look
    // broken rather than the first load.
    expect(shouldRefuse(url('/api/judges?page=1'), 'GET', true)).toBe(true)
    expect(shouldRefuse(url('/api/judges?page=2'), 'GET', true)).toBe(false)
  })

  test('refuses each endpoint separately', () => {
    resetFailFirst()
    // Each screen owns its own failed state; one screen recovering must not
    // heal another that has not been visited yet.
    expect(shouldRefuse(url('/api/judges'), 'GET', true)).toBe(true)
    expect(shouldRefuse(url('/api/court-houses'), 'GET', true)).toBe(true)
    expect(shouldRefuse(url('/api/judges/1/education'), 'GET', true)).toBe(true)
  })

  test('leaves the readiness probe alone', () => {
    resetFailFirst()
    // The runner curls this to decide the fixture is up. Refusing it would
    // make a fail-first fixture look like one that never started.
    expect(shouldRefuse(url('/api/judges?__probe=1'), 'GET', true)).toBe(false)
    // And the probe must not consume the refusal the flow is waiting for.
    expect(shouldRefuse(url('/api/judges'), 'GET', true)).toBe(true)
  })

  test('refuses nothing when it is not armed', () => {
    resetFailFirst()
    expect(shouldRefuse(url('/api/judges'), 'GET', false)).toBe(false)
  })

  test('refuses only reads', () => {
    resetFailFirst()
    // A refused POST would test the write path's error handling, which is
    // 07-write-review's job and is asserted against the real refusals.
    expect(shouldRefuse(url('/api/reviews'), 'POST', true)).toBe(false)
    expect(shouldRefuse(url('/api/judges/1/follow'), 'DELETE', true)).toBe(false)
  })

  test('leaves anything that is not the api alone', () => {
    resetFailFirst()
    expect(shouldRefuse(url('/healthz'), 'GET', true)).toBe(false)
  })
})

describe('which server a flow asks for', () => {
  const frontMatter = (tags: string[]): string =>
    `appId: x\nname: y\ntags:\n${tags.map(t => `  - ${t}`).join('\n')}\n---\n- launchApp\n`

  test('reads the flaky tag', () => {
    expect(wantsFailFirstServer(frontMatter(['mobile', 'flaky']))).toBe(true)
    expect(wantsFailFirstServer(frontMatter(['mobile', 'smoke']))).toBe(false)
  })

  test('offline and flaky are different requests', () => {
    // One wants no server at all; the other wants a server that answers
    // badly once. A flow asking for both would be asking for a retry that
    // can never succeed.
    expect(wantsOfflineServer(frontMatter(['offline']))).toBe(true)
    expect(wantsFailFirstServer(frontMatter(['offline']))).toBe(false)
  })

  test('a flow with no tags asks for neither', () => {
    expect(wantsFailFirstServer('appId: x\n---\n- launchApp\n')).toBe(false)
    expect(wantsOfflineServer('appId: x\n---\n- launchApp\n')).toBe(false)
  })

  test('the tag list stops at the end of the block', () => {
    // `flaky` appearing later in the file, in a comment or a step, is not a
    // declaration.
    const source = 'appId: x\ntags:\n  - mobile\nname: flaky\n---\n# flaky\n- launchApp\n'
    expect(flowTags(source)).toEqual(['mobile'])
    expect(wantsFailFirstServer(source)).toBe(false)
  })
})

describe('the refusal reaches the wire', () => {
  // `shouldRefuse` being right proves nothing if nothing calls it. This is
  // the same delivery-versus-transform distinction that let the squared tab
  // bar ship for three weeks without ever being compiled in.
  test('answers 503 once, then the real body', async () => {
    resetFailFirst()
    process.env.MOBILE_E2E_FAIL_FIRST = '1'
    try {
      const first = await handleAsync(new Request('http://localhost:4399/api/judges'))
      expect(first.status).toBe(503)

      const second = await handleAsync(new Request('http://localhost:4399/api/judges'))
      expect(second.status).toBe(200)
      // A bare array of judges, which is what the directory reads.
      expect((await second.json() as any).length).toBe(27)
    }
    finally {
      delete process.env.MOBILE_E2E_FAIL_FIRST
      resetFailFirst()
    }
  })

  test('serves normally when the fixture is not armed', async () => {
    resetFailFirst()
    delete process.env.MOBILE_E2E_FAIL_FIRST
    const response = await handleAsync(new Request('http://localhost:4399/api/judges'))
    expect(response.status).toBe(200)
  })
})
