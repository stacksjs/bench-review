import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'

/**
 * GET /api/judges — list all judges with their courthouse hydrated.
 *
 * The SPA (JudgeDirectory.stx, ReviewJudgeSearch.stx, home.stx
 * featured strip) reads from this. The seed data in
 * `database/seeders/JudgeSeeder.ts` is what populates the table.
 *
 * We fetch both tables and join in memory rather than issue a SQL
 * JOIN — the project's ORM (`Model.query()`) doesn't surface a
 * `.leftJoin()` helper, and the seed set is small enough that one
 * extra round-trip is cheaper than dropping to the raw db driver
 * for the directory route. Swap to a JOIN at scale.
 */
export default new Action({
  name: 'Judge Index',
  description: 'List judges with their courthouse',
  method: 'GET',
  async handle() {
    const [judges, courtHouses] = await Promise.all([
      Judge.all(),
      CourtHouse.all(),
    ])

    // Build the FK lookup once so the map below stays O(n+m), not O(n*m).
    const courtById = new Map<number, any>()
    for (const ch of courtHouses)
      courtById.set(ch.id, ch)

    const enriched = judges.map((j: any) => {
      const court = courtById.get(j.court_house_id)
      return {
        id: j.id,
        uuid: j.uuid,
        name: j.name,
        // Shape matches `~/resources/types.Judge` — `photo`, `location`,
        // `court.{id,name,image}` — so existing components can drop the
        // static `sample.ts` import and consume this without other changes.
        photo: j.image_url,
        location: court ? `${court.city || ''}${court.state ? `, ${court.state}` : ''}`.trim() : '',
        // Review aggregates (rating + count) are lazy-loaded by the
        // reviews store — directory cards render an empty state until
        // the user opens a judge profile that calls the byJudge endpoint.
        // Returning these fields here would re-introduce the N+1
        // problem the lazy design exists to avoid.
        court: court
          ? { id: court.id, name: court.name, image: court.image }
          : { id: null, name: 'Unknown court', image: null },
      }
    })

    return response.json(enriched)
  },
})
