import { db, Seeder } from '@stacksjs/database'

/**
 * Deterministic initials-avatar placeholder for judges we don't have a
 * verified portrait URL for. Always renders (no broken-image risk) and
 * reads clearly as a placeholder rather than a misattributed photo.
 */
function avatar(name: string): string {
  const clean = name.replace(/^Hon\.\s*/, '').replace(/\s+(?:Jr\.|Sr\.|III|II)$/, '')
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&size=256&background=1f2937&color=ffffff&bold=true`
}

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

    // Practice-area assignments are deliberately specific (chosen
    // to match each judge's docket) rather than random. The
    // /reviews Explore Categories sidebar reads counts directly off
    // this column, so changes here move the numbers users see.
    const judges: Array<{ name: string, image_url: string, courtHouse: string, practice_area: string }> = [
      // Supreme Court of the United States — appellate court
      {
        name: 'Hon. John G. Roberts Jr.',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Official_roberts_CJ.jpg/800px-Official_roberts_CJ.jpg',
        courtHouse: 'Supreme Court of the United States',
        practice_area: 'appellate',
      },
      {
        name: 'Hon. Sonia Sotomayor',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Sonia_Sotomayor_in_SCOTUS_robe.jpg/800px-Sonia_Sotomayor_in_SCOTUS_robe.jpg',
        courtHouse: 'Supreme Court of the United States',
        practice_area: 'appellate',
      },
      {
        name: 'Hon. Elena Kagan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Elena_Kagan_Official_SCOTUS_Portrait.jpg/800px-Elena_Kagan_Official_SCOTUS_Portrait.jpg',
        courtHouse: 'Supreme Court of the United States',
        practice_area: 'appellate',
      },

      // US Court of Appeals for the Ninth Circuit — appellate
      {
        name: 'Hon. Mary M. Schroeder',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Mary_M._Schroeder.jpg/800px-Mary_M._Schroeder.jpg',
        courtHouse: 'US Court of Appeals for the Ninth Circuit',
        practice_area: 'appellate',
      },

      // Stanley Mosk Courthouse — presiding judge of LA Superior, civil docket
      {
        name: 'Hon. Samantha P. Jessner',
        image_url: 'https://images.unsplash.com/photo-1573497019418-b400bb3ab074?w=800&q=80&fit=facearea&facepad=2',
        courtHouse: 'Stanley Mosk Courthouse',
        practice_area: 'civil',
      },

      // NY County Supreme — famously handled the Trump civil fraud case
      {
        name: 'Hon. Arthur F. Engoron',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Arthur_Engoron.jpg/800px-Arthur_Engoron.jpg',
        courtHouse: 'New York County Supreme Court',
        practice_area: 'civil',
      },

      // SDNY — complex commercial trial work
      {
        name: 'Hon. Lewis A. Kaplan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Judge_Lewis_A._Kaplan.jpg/800px-Judge_Lewis_A._Kaplan.jpg',
        courtHouse: 'Daniel Patrick Moynihan US Courthouse',
        practice_area: 'civil',
      },

      // DDC — federal criminal docket
      {
        name: 'Hon. Tanya S. Chutkan',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Judge_Tanya_Chutkan_2014.jpg/800px-Judge_Tanya_Chutkan_2014.jpg',
        courtHouse: 'E. Barrett Prettyman United States Courthouse',
        practice_area: 'criminal',
      },

      // Supreme Court of the United States — remaining sitting justices.
      // (Roberts/Sotomayor/Kagan are seeded above; this completes the
      // current nine-member bench.)
      { name: 'Hon. Clarence Thomas', image_url: avatar('Clarence Thomas'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },
      { name: 'Hon. Samuel A. Alito Jr.', image_url: avatar('Samuel Alito'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },
      { name: 'Hon. Neil M. Gorsuch', image_url: avatar('Neil Gorsuch'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },
      { name: 'Hon. Brett M. Kavanaugh', image_url: avatar('Brett Kavanaugh'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },
      { name: 'Hon. Amy Coney Barrett', image_url: avatar('Amy Coney Barrett'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },
      { name: 'Hon. Ketanji Brown Jackson', image_url: avatar('Ketanji Brown Jackson'), courtHouse: 'Supreme Court of the United States', practice_area: 'appellate' },

      // US Court of Appeals for the Ninth Circuit — additional judges.
      { name: 'Hon. Kim McLane Wardlaw', image_url: avatar('Kim Wardlaw'), courtHouse: 'US Court of Appeals for the Ninth Circuit', practice_area: 'appellate' },
      { name: 'Hon. Jacqueline H. Nguyen', image_url: avatar('Jacqueline Nguyen'), courtHouse: 'US Court of Appeals for the Ninth Circuit', practice_area: 'appellate' },
      { name: 'Hon. Milan D. Smith Jr.', image_url: avatar('Milan Smith'), courtHouse: 'US Court of Appeals for the Ninth Circuit', practice_area: 'appellate' },

      // SDNY (Daniel Patrick Moynihan US Courthouse) — district judges.
      { name: 'Hon. Loretta A. Preska', image_url: avatar('Loretta Preska'), courtHouse: 'Daniel Patrick Moynihan US Courthouse', practice_area: 'civil' },
      { name: 'Hon. Jesse M. Furman', image_url: avatar('Jesse Furman'), courtHouse: 'Daniel Patrick Moynihan US Courthouse', practice_area: 'civil' },
      { name: 'Hon. Analisa Torres', image_url: avatar('Analisa Torres'), courtHouse: 'Daniel Patrick Moynihan US Courthouse', practice_area: 'civil' },

      // DDC (E. Barrett Prettyman) — district judges.
      { name: 'Hon. James E. Boasberg', image_url: avatar('James Boasberg'), courtHouse: 'E. Barrett Prettyman United States Courthouse', practice_area: 'civil' },
      { name: 'Hon. Amit P. Mehta', image_url: avatar('Amit Mehta'), courtHouse: 'E. Barrett Prettyman United States Courthouse', practice_area: 'civil' },
      { name: 'Hon. Beryl A. Howell', image_url: avatar('Beryl Howell'), courtHouse: 'E. Barrett Prettyman United States Courthouse', practice_area: 'criminal' },

      // New York County Supreme Court — additional justice.
      { name: 'Hon. Juan M. Merchan', image_url: avatar('Juan Merchan'), courtHouse: 'New York County Supreme Court', practice_area: 'criminal' },
    ]

    for (const judge of judges) {
      const courtHouseId = courthouseByName.get(judge.courtHouse)
      if (!courtHouseId)
        continue

      // Update path: when the seeded data changes (e.g. we add the
      // practice_area column), running the seeder again should update
      // existing rows instead of silently skipping them.
      const existing = await db.selectFrom('judges' as any)
        .select(['id'] as any)
        .where('name' as any, '=', judge.name)
        .where('court_house_id' as any, '=', courtHouseId)
        .executeTakeFirst() as { id: number } | undefined

      if (existing) {
        await db.updateTable('judges' as any)
          .set({
            image_url: judge.image_url,
            practice_area: judge.practice_area,
          } as any)
          .where('id' as any, '=', existing.id)
          .execute()
        continue
      }

      await db.insertInto('judges' as any).values({
        name: judge.name,
        image_url: judge.image_url,
        court_house_id: courtHouseId,
        practice_area: judge.practice_area,
      } as any).execute()
    }
  }
}
