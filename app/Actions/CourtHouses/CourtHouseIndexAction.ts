import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'

/**
 * GET /api/court-houses — list all courthouses.
 *
 * Powers CourtHouseDirectory.stx + the courthouse picker in
 * ReviewJudgeSearch.stx. Reads straight from the table populated by
 * `database/seeders/CourtHouseSeeder.ts`.
 */
export default new Action({
  name: 'CourtHouse Index',
  description: 'List all courthouses',
  method: 'GET',
  async handle() {
    const rows = await CourtHouse.all()
    return response.json(rows)
  },
})
