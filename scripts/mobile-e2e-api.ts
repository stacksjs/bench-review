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
      likes: (i * 7) % 23,
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
    }
  })
}

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

  // No session in the suite, so the profile screen's signed-out state is what
  // gets tested. That is the state a fresh install is in.
  if (path === '/api/me/reviews')
    return json({ error: 'Unauthenticated' }, 401)

  return json({ error: 'Not found.' }, 404)
}

export function serve(port: number = DEFAULT_PORT): { stop: () => void, port: number } {
  const server = Bun.serve({ port, fetch: handle })
  return { stop: () => server.stop(true), port: server.port }
}

if (import.meta.main) {
  const port = Number(process.env.MOBILE_E2E_PORT || DEFAULT_PORT)
  const { port: bound } = serve(port)
  console.log(`mobile e2e fixture api on http://localhost:${bound}`)
}
