import { db, Seeder } from '@stacksjs/database'

/**
 * Fixed-data seeder for `judges`.
 *
 * Runs alphabetically after CourtHouseSeeder so the FK lookups
 * below resolve to real `court_houses.id` values. Idempotent on
 * `(name, court_house_id)`.
 *
 * Like CourtHouseSeeder, uses raw `db.insertInto` rather than
 * `Judge.create()` to sidestep the camelCase→snake_case mapping
 * gap in the ORM's `create()` path.
 */
export default class JudgeSeeder extends Seeder {
  async run(): Promise<void> {
    // Pre-resolve courthouse IDs so the inner loop doesn't fan out to
    // one query per judge. Missing courthouses warn rather than throw —
    // the seeder is meant to be resilient to ordering surprises.
    const courthouseByName = new Map<string, number>()
    for (const name of [
      'Supreme Court of the United States',
      'US Court of Appeals for the Ninth Circuit',
      'Stanley Mosk Courthouse',
      'New York County Supreme Court',
      'Daniel Patrick Moynihan US Courthouse',
      'E. Barrett Prettyman United States Courthouse',
    ]) {
      const ch = await db.selectFrom('court_houses' as any)
        .select(['id'] as any)
        .where('name' as any, '=', name)
        .executeTakeFirst() as { id: number } | undefined
      if (ch?.id)
        courthouseByName.set(name, ch.id)
      else
        console.warn(`[JudgeSeeder] No CourtHouse "${name}" — judges for this court will be skipped. Run CourtHouseSeeder first.`)
    }

    const judges: Array<{ name: string, image_url: string, courtHouse: string }> = [
      // Supreme Court of the United States
      {
        name: 'Hon. John G. Roberts Jr.',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Official_roberts_CJ.jpg/800px-Official_roberts_CJ.jpg',
        courtHouse: 'Supreme Court of the United States',
      },
      {
        name: 'Hon. Sonia Sotomayor',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Sonia_Sotomayor_in_SCOTUS_robe.jpg/800px-Sonia_Sotomayor_in_SCOTUS_robe.jpg',
        courtHouse: 'Supreme Court of the United States',
      },
      {
        name: 'Hon. Elena Kagan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Elena_Kagan_Official_SCOTUS_Portrait.jpg/800px-Elena_Kagan_Official_SCOTUS_Portrait.jpg',
        courtHouse: 'Supreme Court of the United States',
      },

      // US Court of Appeals for the Ninth Circuit
      {
        name: 'Hon. Mary M. Schroeder',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Mary_M._Schroeder.jpg/800px-Mary_M._Schroeder.jpg',
        courtHouse: 'US Court of Appeals for the Ninth Circuit',
      },

      // Stanley Mosk Courthouse (LA County Superior)
      {
        name: 'Hon. Samantha P. Jessner',
        image_url: 'https://images.unsplash.com/photo-1573497019418-b400bb3ab074?w=800&q=80&fit=facearea&facepad=2',
        courtHouse: 'Stanley Mosk Courthouse',
      },

      // NY County Supreme Court
      {
        name: 'Hon. Arthur F. Engoron',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Arthur_Engoron.jpg/800px-Arthur_Engoron.jpg',
        courtHouse: 'New York County Supreme Court',
      },

      // Daniel Patrick Moynihan US Courthouse (SDNY)
      {
        name: 'Hon. Lewis A. Kaplan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Judge_Lewis_A._Kaplan.jpg/800px-Judge_Lewis_A._Kaplan.jpg',
        courtHouse: 'Daniel Patrick Moynihan US Courthouse',
      },

      // E. Barrett Prettyman US Courthouse (DC Circuit + DDC)
      {
        name: 'Hon. Tanya S. Chutkan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Judge_Tanya_Chutkan_2014.jpg/800px-Judge_Tanya_Chutkan_2014.jpg',
        courtHouse: 'E. Barrett Prettyman United States Courthouse',
      },
    ]

    for (const judge of judges) {
      const courtHouseId = courthouseByName.get(judge.courtHouse)
      if (!courtHouseId)
        continue

      const existing = await db.selectFrom('judges' as any)
        .select(['id'] as any)
        .where('name' as any, '=', judge.name)
        .where('court_house_id' as any, '=', courtHouseId)
        .executeTakeFirst()
      if (existing)
        continue

      await db.insertInto('judges' as any).values({
        name: judge.name,
        image_url: judge.image_url,
        court_house_id: courtHouseId,
      } as any).execute()
    }
  }
}
