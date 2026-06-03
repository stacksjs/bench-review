import { Action } from '@stacksjs/actions'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/judges/search?q=… — server-side typeahead.
 *
 * Powers the review form's judge picker (and any future autocomplete).
 * Shape matches `JudgeIndexAction` so the SPA can drop the result
 * straight into the same `Judge` type without re-mapping.
 *
 * Search behaviour:
 *  - `q` < 1 char  → returns `[]` (avoids dumping the table on stray
 *                    keystrokes / blur-then-refocus events)
 *  - case-insensitive substring match against name, court name,
 *    city, and state
 *  - capped at 20 rows — typeaheads with longer lists are useless
 *
 * In-memory JOIN matches `JudgeIndexAction`'s approach — the codebase
 * ORM doesn't surface `.leftJoin()` on `Model.query()`. The seed set
 * is small; if volumes climb past a few hundred judges, swap to a
 * raw `db.raw(...)` SQL JOIN.
 */
const MIN_LEN = 1
const LIMIT = 20

export default new Action({
  name: 'Judge Search',
  description: 'Server-side judge typeahead',
  method: 'GET',
  async handle() {
    const raw = String((request.query?.q ?? request.get?.('q') ?? '')).trim()
    if (raw.length < MIN_LEN)
      return response.json([])

    const needle = raw.toLowerCase()

    const [judges, courtHouses] = await Promise.all([
      Judge.all(),
      CourtHouse.all(),
    ])
    const courtById = new Map<number, any>()
    for (const ch of courtHouses)
      courtById.set(ch.id, ch)

    const matches = (judges as any[])
      .map((j) => {
        const court = courtById.get(j.court_house_id)
        return { j, court }
      })
      .filter(({ j, court }) => {
        if ((j.name as string)?.toLowerCase().includes(needle))
          return true
        if (court?.name?.toLowerCase().includes(needle))
          return true
        if (court?.city?.toLowerCase().includes(needle))
          return true
        if (court?.state?.toLowerCase().includes(needle))
          return true
        return false
      })
      .slice(0, LIMIT)
      .map(({ j, court }) => ({
        id: j.id,
        uuid: j.uuid,
        name: j.name,
        photo: j.image_url,
        location: court?.city && court?.state ? `${court.city}, ${court.state}` : '',
        court: court
          ? { id: court.id, name: court.name, image: court.image }
          : { id: null, name: 'Unknown court', image: null },
      }))

    return response.json(matches)
  },
})
