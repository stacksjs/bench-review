import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * GET /api/judges/{id} — one judge, hydrated with their courthouse.
 *
 * Added for the native app (bench-review#79). A native detail screen is
 * reached by path — Craft's `navigation.open('/judges/42')` carries a path and
 * nothing else — so it cannot be handed the row the list already holds. Until
 * now the only way to learn about one judge was `GET /api/judges`, the whole
 * directory, which is an absurd amount of work to render one profile on a
 * phone.
 *
 * The web wants it too: `Bench/Judge/ProfileHeader.stx` resolves a judge by
 * running `.find()` over the full directory in the store, which is why the
 * profile page cannot render until the entire list has loaded.
 *
 * Same shape as a row from `JudgeIndexAction`, so a caller can use the two
 * interchangeably.
 */
export default new Action({
  name: 'Judge Show',
  description: 'One judge with their courthouse',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid judge id.',
    },
  },

  async handle() {
    const id = Number(request.params?.id)
    if (!Number.isInteger(id) || id <= 0)
      return response.json({ error: 'Invalid judge id.' }, 422)

    const row = await (db.selectFrom('judges') as any)
      .leftJoin('court_houses' as any, 'court_houses.id', '=', 'judges.court_house_id')
      .select([
        'judges.id as id',
        'judges.uuid as uuid',
        'judges.name as name',
        'judges.image_url as image_url',
        'judges.practice_area as practice_area',
        'judges.bio as bio',
        'judges.jurisdiction as jurisdiction',
        'court_houses.id as court_id',
        'court_houses.name as court_name',
        'court_houses.city as court_city',
        'court_houses.state as court_state',
        'court_houses.image as court_image',
      ])
      .where('judges.id', '=', id)
      .executeTakeFirst() as Record<string, any> | undefined

    if (!row)
      return response.json({ error: 'Judge not found.' }, 404)

    return response.json({
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      photo: row.image_url,
      practice_area: row.practice_area ?? null,
      bio: row.bio ?? null,
      jurisdiction: row.jurisdiction ?? null,
      // Joined only when both halves exist — most federal appellate courts
      // carry a state and no city (bench-review#56).
      location: [row.court_city, row.court_state].filter(Boolean).join(', '),
      court: row.court_id != null
        ? { id: row.court_id, name: row.court_name, image: row.court_image }
        : { id: null, name: 'Unknown court', image: null },
    })
  },
})
