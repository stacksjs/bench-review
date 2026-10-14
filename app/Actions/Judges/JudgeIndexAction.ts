import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /api/judges — list judges with their courthouse hydrated.
 *
 * The SPA (JudgeDirectory.stx, ReviewJudgeSearch.stx, home.stx
 * featured strip) reads from this. The seed data in
 * `database/seeders/JudgeSeeder.ts` is what populates the table.
 *
 * ── One joined query, not two whole tables (bench-review#56) ────────────────
 * This used to run `Judge.all()` + `CourtHouse.all()` and stitch them in a
 * Map: every request hydrated ~2,740 judge and ~200 courthouse ORM model
 * instances to emit a plain array, on an unauthenticated route. It is now a
 * single `LEFT JOIN` selecting only the nine columns the payload uses, which
 * is the same answer at a fraction of the work. (The old comment claiming the
 * ORM has no `.leftJoin()` was wrong — `HomeHighlightsAction` already used it.)
 *
 * ── What is deliberately NOT fixed here ─────────────────────────────────────
 * The response is still the WHOLE directory, because the client is built
 * around that: eight components read `useStore('judges').judges()` and derive
 * from it — the directory's own filter and pagination, the category counts,
 * the courthouse pages, the review form's picker, and a single-judge lookup
 * that does `.find()` over the array. Capping the rows here would silently
 * truncate all of them.
 *
 * Moving them to server-side pagination is the right end state and is a
 * frontend change, not a security fix, so it is not bundled into this one.
 * The guard below is what stands in until then: a ceiling that cannot be
 * exceeded silently.
 */

/**
 * Hard ceiling on rows returned. Set far above the current directory (~2,740)
 * so it never truncates in practice — it exists so that an unbounded `SELECT`
 * cannot quietly become the thing that falls over as the CourtListener import
 * grows. Hitting it is a bug report, not a limit to tune, which is why it
 * shouts.
 */
const MAX_ROWS = 10000

interface JudgeRow {
  id: number
  uuid: string | null
  name: string | null
  image_url: string | null
  practice_area: string | null
  court_id: number | null
  court_name: string | null
  court_city: string | null
  court_state: string | null
  court_image: string | null
}

export default new Action({
  name: 'Judge Index',
  description: 'List judges with their courthouse',
  method: 'GET',
  async handle() {
    const rows = await (db.selectFrom('judges') as any)
      .leftJoin('court_houses' as any, 'court_houses.id', '=', 'judges.court_house_id')
      .select([
        'judges.id as id',
        'judges.uuid as uuid',
        'judges.name as name',
        'judges.image_url as image_url',
        'judges.practice_area as practice_area',
        'court_houses.id as court_id',
        'court_houses.name as court_name',
        'court_houses.city as court_city',
        'court_houses.state as court_state',
        'court_houses.image as court_image',
      ])
      .limit(MAX_ROWS)
      .execute() as JudgeRow[]

    if (rows.length >= MAX_ROWS)
      console.warn(`[judges.index] hit the ${MAX_ROWS}-row ceiling — the directory is now truncated and needs server-side pagination.`)

    const enriched = rows.map(r => ({
      id: r.id,
      uuid: r.uuid,
      name: r.name,
      // Shape matches `~/resources/types.Judge` — `photo`, `location`,
      // `court.{id,name,image}` — so existing components can drop the
      // static `sample.ts` import and consume this without other changes.
      photo: r.image_url,
      // Joined with ', ' only when BOTH halves exist. The previous expression
      // concatenated unconditionally, so a courthouse with a state and no
      // city — which is most of the federal appellate courts in the import —
      // rendered as ", OR".
      location: [r.court_city, r.court_state].filter(Boolean).join(', '),
      // Practice-area category for the /reviews "Explore Categories"
      // sidebar. Null means unclassified; the sidebar shows counts
      // only for non-null values.
      practice_area: r.practice_area ?? null,
      // Review aggregates (rating + count) are lazy-loaded by the
      // reviews store — directory cards render an empty state until
      // the user opens a judge profile that calls the byJudge endpoint.
      // Returning these fields here would re-introduce the N+1
      // problem the lazy design exists to avoid.
      court: r.court_id != null
        ? { id: r.court_id, name: r.court_name, image: r.court_image }
        : { id: null, name: 'Unknown court', image: null },
    }))

    return response.json(enriched)
  },
})
