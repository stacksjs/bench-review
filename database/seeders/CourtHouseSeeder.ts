import { db, Seeder } from '@stacksjs/database'

/**
 * Fixed-data seeder for `court_houses`.
 *
 * These are the real-world courts the app expects to exist in every
 * environment. Small on purpose — covers the courts the JudgeSeeder
 * references. Add more as bench-review's coverage grows; keep this
 * file as the single source of truth for "courts we want in
 * prod-like demos".
 *
 * Why raw `db.insertInto` instead of `CourtHouse.create()`:
 * `defineModel`'s `create()` doesn't auto-translate camelCase model
 * attributes (`zipCode`) to snake_case DB columns (`zip_code`), and
 * the model's attribute filter strips unknown keys. Same path the
 * factory seeder takes — see `core/database/src/seeder.ts`.
 *
 * Idempotent: each row keys on `name`, so re-running `./buddy seed`
 * doesn't duplicate.
 */
export default class CourtHouseSeeder extends Seeder {
  async run(): Promise<void> {
    const rows = [
      {
        name: 'Supreme Court of the United States',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Supreme_Court_Front_Dusk.jpg/1280px-Supreme_Court_Front_Dusk.jpg',
        address: '1 First Street NE',
        city: 'Washington',
        state: 'DC',
        zip_code: '20543',
      },
      {
        name: 'US Court of Appeals for the Ninth Circuit',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/James_R._Browning_United_States_Courthouse.jpg/1280px-James_R._Browning_United_States_Courthouse.jpg',
        address: '95 Seventh Street',
        city: 'San Francisco',
        state: 'CA',
        zip_code: '94103',
      },
      {
        name: 'Stanley Mosk Courthouse',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Stanley_Mosk_Courthouse.jpg/1280px-Stanley_Mosk_Courthouse.jpg',
        address: '111 North Hill Street',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90012',
      },
      {
        name: 'New York County Supreme Court',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/NY_Supreme_Court_60_Centre_Street.jpg/1280px-NY_Supreme_Court_60_Centre_Street.jpg',
        address: '60 Centre Street',
        city: 'New York',
        state: 'NY',
        zip_code: '10007',
      },
      {
        name: 'Daniel Patrick Moynihan US Courthouse',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Daniel_Patrick_Moynihan_United_States_Courthouse.jpg/1280px-Daniel_Patrick_Moynihan_United_States_Courthouse.jpg',
        address: '500 Pearl Street',
        city: 'New York',
        state: 'NY',
        zip_code: '10007',
      },
      {
        name: 'E. Barrett Prettyman United States Courthouse',
        image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/E._Barrett_Prettyman_Federal_Courthouse.jpg/1280px-E._Barrett_Prettyman_Federal_Courthouse.jpg',
        address: '333 Constitution Avenue NW',
        city: 'Washington',
        state: 'DC',
        zip_code: '20001',
      },
    ]

    for (const row of rows) {
      const existing = await db.selectFrom('court_houses' as any)
        .select(['id'] as any)
        .where('name' as any, '=', row.name)
        .executeTakeFirst()
      if (existing)
        continue
      await db.insertInto('court_houses' as any).values(row as any).execute()
    }
  }
}
