/**
 * The API the iOS end-to-end run tests against (bench-review#81).
 *
 * ## Why a fixture rather than the real server
 *
 * The native app has no bundled copy of anything: every screen's content
 * arrives over HTTP, fixed at BUILD time to whatever `MOBILE_URL` said. That
 * changes what the suite needs from a server in two ways.
 *
 * 1. **The offline flow has to be able to switch it off.** Being offline is
 *    the state this suite most needs to cover, because it only happens when
 *    something else has already broken. `./buddy dev` belongs to whoever is
 *    running it, so a suite that killed it would be taking someone's work
 *    away mid-run. This one is the suite's own, on its own port, and stopping
 *    it is how the offline flow becomes offline.
 *
 *    Airplane mode — which the old offline flow used — does NOT work here.
 *    The simulator shares the Mac's network stack and loopback is not the
 *    radio, so the app would keep reaching a localhost server with the plane
 *    switch on, and the flow would pass while testing nothing.
 *
 * 2. **The data has to be the same every run.** A flow that taps the first row
 *    and asserts what opens needs to know what the first row is. Against a
 *    development database that changes with every ingest, the only assertions
 *    left are shape ones, and "a detail screen opened" cannot tell a working
 *    row from one that opens the wrong judge.
 *
 * The names are deliberately unmistakable. If the suite is ever pointed at a
 * real server by accident, the flows fail on the first assertion instead of
 * passing by luck against whoever happens to sort first.
 *
 * ## Faithfulness
 *
 * Shapes mirror the real Actions, including the parts that are easy to get
 * wrong and that the screens have had bugs about:
 *
 *   - `/api/judges` and `/api/court-houses` answer a BARE ARRAY; the paged
 *     endpoints answer `{data, current_page, per_page, total, last_page}`.
 *   - the review feed nests its judge under `image_url`, not `photo`, because
 *     that is what `attachJudgeContext` leaves on the row.
 *   - review and opinion bodies are sanitiser-escaped HTML, so a screen that
 *     forgets to strip tags or decode entities fails visibly.
 *
 * Photos are null throughout. The app draws initials instead, which keeps the
 * run off the public internet — an e2e suite that needs ui-avatars.com to be
 * up is a suite that fails for reasons that are not about this app.
 */

export const DEFAULT_PORT = 4399

export interface FixtureJudge {
  id: number
  name: string
  courtId: number
}

/**
 * Three named judges the flows can assert on, then filler.
 *
 * The named three are first in id order AND first alphabetically, so a flow
 * can tap the first row without knowing how the directory sorts. The filler
 * exists so the directory has enough rows to page and to scroll, which is the
 * state the screen is normally in.
 */
export const NAMED_JUDGES: FixtureJudge[] = [
  { id: 1, name: 'Fixture A. Alder', courtId: 1 },
  { id: 2, name: 'Fixture B. Birch', courtId: 1 },
  { id: 3, name: 'Fixture C. Cedar', courtId: 2 },
]

const FILLER_SURNAMES = [
  'Dogwood', 'Elm', 'Fir', 'Gum', 'Hazel', 'Ironwood', 'Juniper', 'Katsura',
  'Linden', 'Maple', 'Nutmeg', 'Oak', 'Pine', 'Quince', 'Rowan', 'Spruce',
  'Teak', 'Umbrella', 'Vine', 'Walnut', 'Yew', 'Zelkova',
]

export const JUDGES: FixtureJudge[] = [
  ...NAMED_JUDGES,
  ...FILLER_SURNAMES.map((surname, i) => ({
    id: 4 + i,
    name: `Fixture ${String.fromCharCode(68 + (i % 22))}. ${surname}`,
    courtId: 1 + (i % 3),
  })),
]

export const COURT_HOUSES = [
  { id: 1, name: 'Fixture County Courthouse', city: 'Ashford', state: 'OR' },
  { id: 2, name: 'Fixture Federal Building', city: 'Bellweather', state: 'WA' },
  { id: 3, name: 'Fixture Municipal Court', city: 'Carrowmore', state: 'CA' },
]

/** Judge 1 has education; judge 2 deliberately has none, which is the common case. */
export const EDUCATION: Record<number, Array<{ degree: string, school: string, year: number }>> = {
  1: [
    { degree: 'B.A.', school: 'Fixture State University', year: 1974 },
    { degree: 'J.D.', school: 'Fixture School of Law', year: 1979 },
  ],
}

/**
 * Judge 1 has three pages of opinions at the screen's 25 per page; judge 2 has
 * none. Both states are worth having — an empty opinions list is what every
 * real judge shows today, since `judge_opinions` has no rows in development.
 */
const OPINION_COUNT: Record<number, number> = { 1: 63, 2: 0 }
const OUTCOMES = ['Affirmed', 'Reversed', 'Remanded', 'Dismissed']

function opinionsFor(judgeId: number): any[] {
  const count = OPINION_COUNT[judgeId] ?? 0
  return Array.from({ length: count }, (_, i) => ({
    id: 7000 + i,
    judge_id: judgeId,
    case_name: `Fixture v. Example ${i + 1}`,
    citation: `${500 + i} F.3d ${100 + i}`,
    decision_date: new Date(Date.UTC(2026, i % 12, 1 + (i % 27))).toISOString(),
    // An entity the screen has to DECODE rather than print, and an ampersand
    // the sanitiser escaped. Both have been real bugs (74a4397c, dcf1cadb).
    summary: '<p>Held that the statute&rsquo;s plain text controls, and that Alder &amp; Co were on notice.</p>',
    outcome_label: OUTCOMES[i % OUTCOMES.length],
    source_provider: 'manual',
  }))
}

const REVIEW_TITLES = [
  'Ran a tight, fair calendar',
  'Patient with a nervous witness',
  'Rulings explained from the bench',
  'Kept counsel to the point',
  'Clear with self-represented parties',
]
const REVIEWER_NAMES = ['Dana Clerk', 'Anonymous attorney', 'Anonymous reviewer', 'M. Reyes']

/** Two pages at the feed's 20 per page, so the pager has somewhere to go. */
const FEED_SIZE = 32

function court(id: number) {
  return COURT_HOUSES.find(c => c.id === id) ?? COURT_HOUSES[0]
}

function judgeRow(judge: FixtureJudge) {
  const c = court(judge.courtId)
  return {
    id: judge.id,
    uuid: `fixture-judge-${judge.id}`,
    name: judge.name,
    photo: null,
    practice_area: 'other',
    location: [c.city, c.state].filter(Boolean).join(', '),
    court: { id: c.id, name: c.name, image: null },
  }
}

function feedRows() {
  return Array.from({ length: FEED_SIZE }, (_, i) => {
    const judge = JUDGES[i % JUDGES.length]
    const c = court(judge.courtId)
    return {
      id: 1000 + i,
      title: REVIEW_TITLES[i % REVIEW_TITLES.length],
      content: '<p>Started on time and explained every ruling. Alder &amp; Co were held to the same line.</p><p>Clear with self-represented parties, and said why.</p>',
      rating: 1 + (i % 5),
      likes: likesFor(1000 + i),
      liked_by_me: liked.has(1000 + i),
      judge_id: judge.id,
      judge: {
        id: judge.id,
        name: judge.name,
        // `attachJudgeContext` keeps the column name rather than the
        // endpoint's `photo`. A screen reading `photo` here shows nothing.
        image_url: null,
        context_line: [c.name, c.city, c.state].filter(Boolean).join(' · '),
      },
      reviewer: { id: null, name: REVIEWER_NAMES[i % REVIEWER_NAMES.length], role_label: null },
      created_at: new Date(Date.UTC(2026, 9, 1 + (i % 19), 9, 0, 0)).toISOString(),
      // `toPublicReviewRow` strips `user_id` and states ownership instead, so
      // the feed can hide the like button on a row the viewer wrote. Nothing
      // in the fixture is the viewer's, which is the state a fresh install is
      // in and the one the flows assert.
      is_mine: false,
      // Reviews 1000 and 1001 start with comments so a populated thread and
      // an empty one are both reachable without posting anything.
      comments: COMMENTS[1000 + i]?.length ?? 0,
    }
  })
}

/**
 * Likes, as a toggle the run can actually flip.
 *
 * In memory, so a flow that likes something and relaunches sees it persist
 * within the run and reset between runs — which is what a fixture should do.
 * `LIKE_BASE` is the count before anyone touches it.
 */
const LIKE_BASE: Record<number, number> = { 1000: 4, 1001: 1 }
const liked = new Set<number>()

function likesFor(id: number): number {
  return (LIKE_BASE[id] ?? 0) + (liked.has(id) ? 1 : 0)
}

/**
 * Judges the fixture session follows, same in-memory toggle as the likes.
 *
 * Starts with one, so the run exercises BOTH states without having to tap its
 * way into the second: a flow can check that the already-followed judge reads
 * "Following" on arrival, which is the part a default-false state gets wrong.
 */
const followed = new Set<number>([2])

/**
 * Judges this session has already reviewed, so a second attempt gets the real
 * 409 rather than silently stacking reviews.
 *
 * In memory, same as the likes and the follows: it persists within a run and
 * resets between them.
 */
const reviewed = new Set<number>()
let nextReviewId = 9000

/** The one account the fixture knows, and the token it answers with. */
const FIXTURE_EMAIL = 'clerk@example.test'
const FIXTURE_PASSWORD = 'correct-horse'
const FIXTURE_TOKEN = 'fixture-session-token'

function authed(request: Request): boolean {
  return (request.headers.get('authorization') || '') === `Bearer ${FIXTURE_TOKEN}`
}

/** Seeded threads, plus whatever the run posts. Oldest first, like the API. */
const COMMENTS: Record<number, Array<Record<string, any>>> = {
  1000: [
    {
      id: 5001,
      body: 'Appeared before them twice this year and this matches both times.',
      created_at: '2026-10-02T10:00:00.000Z',
      author: { id: null, name: 'Anonymous attorney' },
      is_mine: false,
    },
    {
      id: 5002,
      body: 'The timekeeping is the part nobody warns you about.',
      created_at: '2026-10-03T11:30:00.000Z',
      author: { id: 7, name: 'Dana Clerk' },
      is_mine: false,
    },
  ],
}
let nextCommentId = 6000

function paged(rows: any[], page: number, perPage: number) {
  const start = (page - 1) * perPage
  return {
    data: rows.slice(start, start + perPage),
    current_page: page,
    per_page: perPage,
    total: rows.length,
    last_page: Math.max(1, Math.ceil(rows.length / perPage)),
  }
}

export function handle(request: Request): Response {
  const url = new URL(request.url)
  const path = url.pathname
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const perPage = Math.max(1, Number(url.searchParams.get('per_page') || 20))
  const json = (value: unknown, status = 200): Response =>
    Response.json(value, { status, headers: { 'Access-Control-Allow-Origin': '*' } })

  if (path === '/api/judges')
    return json(JUDGES.map(judgeRow))

  if (path === '/api/court-houses') {
    return json(COURT_HOUSES.map((c, i) => ({
      ...c,
      address: `${100 + i} Fixture Street`,
      zip_code: `9${i}${i}${i}${i}`,
      active_judges: JUDGES.filter(j => j.courtId === c.id).length,
      // The third courthouse has no ratings, so the dash and the "No ratings
      // yet" caption are exercised alongside the populated case.
      total_reviews: i === 2 ? 0 : 12 + i * 3,
      avg_rating: i === 2 ? null : Math.round((3.4 + i * 0.3) * 10) / 10,
    })))
  }

  const bench = path.match(/^\/api\/court-houses\/(\d+)\/judges$/)
  if (bench) {
    const id = Number(bench[1])
    if (!COURT_HOUSES.some(c => c.id === id))
      return json({ error: 'Courthouse not found.' }, 404)
    const rows = JUDGES.filter(j => j.courtId === id).sort((a, b) => a.name.localeCompare(b.name))
    return json({
      data: rows.map(j => ({
        id: j.id,
        uuid: `fixture-judge-${j.id}`,
        name: j.name,
        photo: null,
        practice_area: 'other',
        jurisdiction: null,
      })),
      total: rows.length,
    })
  }

  const education = path.match(/^\/api\/judges\/(\d+)\/education$/)
  if (education)
    return json({ education: EDUCATION[Number(education[1])] ?? [] })

  const opinions = path.match(/^\/api\/judges\/(\d+)\/opinions$/)
  if (opinions)
    return json(paged(opinionsFor(Number(opinions[1])), page, perPage))

  const byJudge = path.match(/^\/api\/judges\/(\d+)\/reviews$/)
  if (byJudge) {
    const id = Number(byJudge[1])
    // The SAME rows the feed serves, reaction fields and all. The judge
    // screen draws the same chips, so a fixture that dropped `likes` or
    // `comments` here would make them read zero on one screen and a number
    // on the other — which is the inconsistency this endpoint's change was
    // made to remove.
    const rows = feedRows().filter(r => r.judge_id === id).slice(0, 2)
    return json({ data: rows, total: rows.length })
  }

  const one = path.match(/^\/api\/judges\/(\d+)$/)
  if (one) {
    const judge = JUDGES.find(j => j.id === Number(one[1]))
    if (!judge)
      return json({ error: 'Judge not found.' }, 404)
    return json({ ...judgeRow(judge), bio: null })
  }

  if (path === '/api/reviews' && request.method === 'GET') {
    const sort = url.searchParams.get('sort') === 'helpful' ? 'helpful' : 'recent'
    const rows = feedRows()
    const ordered = sort === 'helpful' ? [...rows].sort((a, b) => b.likes - a.likes) : rows
    return json(paged(ordered, page, perPage))
  }

  // Toggling a like, with the same refusals the real action has: auth-gated
  // (a single person could otherwise spam the counter by reloading), 404 for
  // a review that is not published, and 422 for your own work.
  const like = path.match(/^\/api\/reviews\/(\d+)\/like$/)
  if (like && request.method === 'POST') {
    const id = Number(like[1])
    if (!authed(request))
      return json({ error: 'Not authenticated' }, 401)
    if (id < 1000 || id >= 1000 + FEED_SIZE)
      return json({ error: 'Review not found' }, 404)
    if (liked.has(id))
      liked.delete(id)
    else
      liked.add(id)
    return json({ liked: liked.has(id), likes: likesFor(id) })
  }

  const thread = path.match(/^\/api\/reviews\/(\d+)\/comments$/)
  if (thread) {
    const id = Number(thread[1])
    if (id < 1000 || id >= 1000 + FEED_SIZE)
      return json({ error: 'Review not found' }, 404)

    // Reading is public: the endpoint only ever leaks published comments.
    if (request.method === 'GET')
      return json(paged(COMMENTS[id] ?? [], page, perPage))

    if (request.method === 'POST') {
      if (!authed(request))
        return json({ error: 'Not authenticated' }, 401)
      return json({ error: 'A comment arrived without a body.' }, 422)
    }
  }

  // The signed-in app asks for this the moment the Profile screen appears.
  //
  // It answered 401 unconditionally at first, on the reasoning that the suite
  // has no session — and that quietly broke every signed-in flow. `authFetch`
  // treats a 401 as a SPENT TOKEN and clears the Keychain, which is correct:
  // that is what a revoked session should do. So a sign-in succeeded, wrote
  // its token, and was signed back out within a second by this line. The app
  // was behaving properly the whole time.
  //
  // A fixture that answers a status the real server would not is not a
  // simplification, it is a different server.
  if (path === '/api/me/reviews') {
    if (!authed(request))
      return json({ error: 'Unauthenticated' }, 401)
    return json({ data: [], total: 0 })
  }

  // Which judges the session follows. A bare array of ids, as the real action
  // answers — not an envelope, which is the shape mistake that would make the
  // button read "Follow" on a judge already followed.
  if (path === '/api/me/follows') {
    if (!authed(request))
      return json({ error: 'Unauthenticated' }, 401)
    return json([...followed])
  }

  // Following a judge, with the refusals the real routes have: auth-gated and
  // 404 for a judge who is not listed. Both verbs are idempotent, and both
  // state the RESULTING state rather than just `ok` — the screens read
  // `following` and fall back to their own intent without it.
  const follow = path.match(/^\/api\/judges\/(\d+)\/follow$/)
  if (follow && (request.method === 'POST' || request.method === 'DELETE')) {
    const id = Number(follow[1])
    if (!authed(request))
      return json({ error: 'Not authenticated' }, 401)
    if (!JUDGES.some(j => j.id === id))
      return json({ error: 'Judge not found' }, 404)
    if (request.method === 'POST')
      followed.add(id)
    else
      followed.delete(id)
    return json({ ok: true, following: followed.has(id) })
  }

  return json({ error: 'Not found.' }, 404)
}

/**
 * The POST paths that need a parsed body, which `handle` cannot do because it
 * is synchronous — and it is synchronous so that every read is one function
 * call away from a test.
 */
export async function handleAsync(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const json = (value: unknown, status = 200): Response =>
    Response.json(value, { status, headers: { 'Access-Control-Allow-Origin': '*' } })

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, any>
    if (body?.email === FIXTURE_EMAIL && body?.password === FIXTURE_PASSWORD)
      return json({ access_token: FIXTURE_TOKEN, user: { id: 7, name: 'Dana Clerk', email: FIXTURE_EMAIL } })
    // The real endpoint answers the same for an unknown address and a wrong
    // password, so the fixture does too — a friendlier split here would be a
    // fixture teaching a flow to expect an enumeration oracle.
    return json({ error: 'Incorrect email or password' }, 401)
  }

  if (url.pathname === '/api/auth/logout')
    return json({ ok: true })

  // Posting a review (bench-review#79). The refusals are SubmitReviewAction's
  // own, in its own order, because a permissive fixture here would be worse
  // than none: the one thing an e2e run can prove about this screen is that
  // what it sends is what the server will accept.
  //
  // Faithful in the details that cost something to get wrong:
  //   - `type` is NOT required. The native screen omits it and the web sends
  //     it; the action's rule carries no `.required()`, so the router's
  //     `empty && rule.isRequired !== true` lets it through and `handle()`
  //     defaults it to 'neutral'. A fixture that demanded it would fail a
  //     screen the real server accepts.
  //   - length is measured on the VISIBLE TEXT, after tags are stripped. A
  //     body of `<p></p>` is 7 characters of HTML and none of review, which
  //     is how a blank-body review got through once.
  //   - a second review of the same judge is a 409, not a duplicate row.
  if (url.pathname === '/api/reviews' && request.method === 'POST') {
    if (!authed(request))
      return json({ error: 'Not authenticated' }, 401)

    const body = await request.json().catch(() => ({})) as Record<string, any>
    const judgeId = Number(body?.judge_id)
    const rating = Number(body?.rating)
    const title = String(body?.title ?? '').trim()

    if (!Number.isInteger(judgeId) || judgeId < 1)
      return json({ error: 'Pick a judge before submitting.' }, 422)
    if (!(rating >= 1 && rating <= 5))
      return json({ error: 'Pick a rating between 1 and 5 stars.' }, 422)
    if (title.length < 3 || title.length > 255)
      return json({ error: 'Title must be between 3 and 255 characters.' }, 422)

    const visible = String(body?.content ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (visible.length < 10)
      return json({ error: 'Review must be at least 10 characters of actual text.' }, 422)

    if (!JUDGES.some(j => j.id === judgeId))
      return json({ error: 'Judge not found' }, 404)
    if (reviewed.has(judgeId))
      return json({ error: 'You have already reviewed this judge. Edit your existing review instead of posting a new one.' }, 409)

    reviewed.add(judgeId)
    const anonRaw = body?.anonymized
    return json({
      ok: true,
      review: {
        id: nextReviewId++,
        judge_id: judgeId,
        title,
        rating,
        // Recorded the way the action records it, so a test can tell a
        // screen that sent the flag from one that dropped it.
        anonymized: anonRaw === true || anonRaw === 'true' || anonRaw === 1 || anonRaw === '1' ? 1 : 0,
        type: body?.type ?? 'neutral',
        // Pending, as every real submission is: the review does NOT appear
        // in the feed afterwards, and a flow that expected it to would be
        // asserting against a moderation queue that does not exist.
        status: 'pending',
      },
    }, 201)
  }

  const thread = url.pathname.match(/^\/api\/reviews\/(\d+)\/comments$/)
  if (thread && request.method === 'POST') {
    const id = Number(thread[1])
    if (!authed(request))
      return json({ error: 'Not authenticated' }, 401)
    if (id < 1000 || id >= 1000 + FEED_SIZE)
      return json({ error: 'Review not found' }, 404)

    const body = await request.json().catch(() => ({})) as Record<string, any>
    const text = String(body?.body ?? '').trim()
    if (text.length < 5)
      return json({ error: 'Comment must be at least 5 characters.' }, 422)
    if (text.length > 2000)
      return json({ error: 'Comment must be at most 2000 characters.' }, 422)

    const comment = {
      id: nextCommentId++,
      body: text,
      created_at: new Date().toISOString(),
      author: { id: 7, name: 'Dana Clerk' },
      is_mine: true,
    }
    COMMENTS[id] = [...(COMMENTS[id] ?? []), comment]
    return json({ ok: true, comment }, 201)
  }

  return handle(request)
}

export function serve(port: number = DEFAULT_PORT): { stop: () => void, port: number } {
  const server = Bun.serve({ port, fetch: handleAsync })
  return { stop: () => server.stop(true), port: server.port }
}

if (import.meta.main) {
  const port = Number(process.env.MOBILE_E2E_PORT || DEFAULT_PORT)
  const { port: bound } = serve(port)
  console.log(`mobile e2e fixture api on http://localhost:${bound}`)
}
