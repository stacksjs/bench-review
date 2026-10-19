import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * GET /api/court-houses/{id}/judges — the judges who sit at one courthouse.
 *
 * Added for the native courthouse screen (bench-review#79). Without it the
 * only way to answer "who sits here" is `GET /api/judges`, the whole
 * 2,000-row directory, filtered client-side — which is what the web does and
 * is why its courthouse bench tab cannot render until the entire directory
 * has loaded. On a phone that is a lot of network for a list of about ten.
 *
 * Rows are shaped like `JudgeIndexAction`'s, minus the courthouse that the
 * caller already knows, so a screen can hand one straight to the judge
 * screen without translating.
 *
 * No pagination: the largest bench is small enough to send whole, and the
 * screen pages it in memory the way both directories do. `MAX_ROWS` is a
 * ceiling rather than a page size — an unbounded list endpoint is the thing
 * that falls over later without anyone having changed it.
 */
const MAX_ROWS = 500

export default new Action({
  name: 'CourtHouse Judges',
  description: 'The judges sitting at one courthouse',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid courthouse id.',
    },
  },

  async handle() {
    const id = Number(request.params?.id)
    if (!Number.isInteger(id) || id <= 0)
      return response.json({ error: 'Invalid courthouse id.' }, 422)

    // The courthouse has to exist, so an unknown id is a 404 rather than an
    // empty bench — "this courthouse has no judges" and "there is no such
    // courthouse" are different answers and a caller branches on them.
    const court = await (db.selectFrom('court_houses') as any)
      .select(['id'])
      .where('id', '=', id)
      .executeTakeFirst() as { id: number } | undefined

    if (!court)
      return response.json({ error: 'Courthouse not found.' }, 404)

    const rows = await (db.selectFrom('judges') as any)
      .select([
        'id',
        'uuid',
        'name',
        'image_url',
        'practice_area',
        'jurisdiction',
      ])
      .where('court_house_id', '=', id)
      .orderBy('name')
      .limit(MAX_ROWS)
      .execute() as Array<Record<string, any>>

    return response.json({
      data: rows.map(row => ({
        id: row.id,
        uuid: row.uuid,
        name: row.name,
        // `photo`, as every other judge-shaped response calls it.
        photo: row.image_url,
        practice_area: row.practice_area ?? null,
        jurisdiction: row.jurisdiction ?? null,
      })),
      total: rows.length,
    })
  },
})
