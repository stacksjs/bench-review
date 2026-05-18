import { db, Seeder } from '@stacksjs/database'

/**
 * Fixed-data seeder for `judge_reviews`.
 *
 * Runs after JudgeSeeder (alphabetic: J < R) so the FK `judge_id`
 * resolves to real rows. Idempotent on `(judge_id, title)` — running
 * the seeder twice is a no-op rather than a duplicate-key pile-up.
 *
 * `status` is set to `published` (NOT the `pending` default used by
 * SubmitReviewAction) so reviews are immediately visible on
 * `/reviews`, `/judges/:id/reviews`, and any future
 * `/reviews/:slug` show page without a moderation step.
 *
 * Titles are intentionally varied to exercise slug-generation edge
 * cases when the show-page lands: punctuation (em dash, ampersand),
 * leading digits, hyphens already in the title, mixed case, etc.
 *
 * Like the other seeders in this directory, uses raw
 * `db.insertInto` rather than `JudgeReview.create()` because the
 * ORM's `create()` path has a camelCase→snake_case mapping gap that
 * silently drops fields like `judge_id`. Raw insert keeps the
 * column names honest.
 */
export default class ReviewSeeder extends Seeder {
  async run(): Promise<void> {
    // Pre-resolve judge IDs by name — one query for all of them so the
    // inner loop doesn't fan out to a per-review lookup. Missing judges
    // warn rather than throw so the seeder is resilient to JudgeSeeder
    // changes.
    const judgeByName = new Map<string, number>()
    for (const name of [
      'Hon. John G. Roberts Jr.',
      'Hon. Sonia Sotomayor',
      'Hon. Elena Kagan',
      'Hon. Mary M. Schroeder',
      'Hon. Samantha P. Jessner',
      'Hon. Arthur F. Engoron',
      'Hon. Lewis A. Kaplan',
      'Hon. Tanya S. Chutkan',
    ]) {
      const j = await db.selectFrom('judges' as any)
        .select(['id'] as any)
        .where('name' as any, '=', name)
        .executeTakeFirst() as { id: number } | undefined
      if (j?.id)
        judgeByName.set(name, j.id)
      else
        console.warn(`[ReviewSeeder] No Judge "${name}" — reviews for this judge will be skipped. Run JudgeSeeder first.`)
    }

    // Reviews are written by the medium-editor WYSIWYG which emits
    // HTML — keep the seeded `content` as HTML too so list/show
    // pages can `innerHTML` it without a markdown round-trip.
    const reviews: Array<{
      judge: string
      title: string
      content: string
      rating: number
      type: 'positive' | 'negative' | 'neutral'
      likes: number
      comments: number
    }> = [
      // Supreme Court
      {
        judge: 'Hon. John G. Roberts Jr.',
        title: 'A Voice of Reason on the Bench',
        content: '<p>Chief Justice Roberts brings a measured, institutional temperament to every proceeding. His questions cut to the heart of the matter without grandstanding, and the courtroom runs on time.</p><p>What struck me most was his evident commitment to <strong>collegiality</strong> — even in sharply contested cases, he treats counsel on both sides with consistent respect.</p>',
        rating: 5,
        type: 'positive',
        likes: 142,
        comments: 18,
      },
      {
        judge: 'Hon. Sonia Sotomayor',
        title: 'Sharp Questioning, Deep Engagement',
        content: '<p>Justice Sotomayor is famously prepared, and it shows. Her questions during oral argument were the most pointed of the bench — she had clearly read every brief.</p><blockquote>She doesn\'t let counsel hide behind generalities.</blockquote><p>Highly recommend appearing before her if you have a strong record. Less so if you don\'t.</p>',
        rating: 5,
        type: 'positive',
        likes: 98,
        comments: 12,
      },
      {
        judge: 'Hon. Elena Kagan',
        title: 'Plainspoken & Persuasive',
        content: '<p>What I appreciated most: Justice Kagan talks like a normal person. No black-robe theatrics, no Latin where English would do. Just direct, clear questions.</p><p>Her dissents are required reading — clinically argued, often funny.</p>',
        rating: 5,
        type: 'positive',
        likes: 76,
        comments: 9,
      },

      // 9th Circuit
      {
        judge: 'Hon. Mary M. Schroeder',
        title: 'Decades of Experience on Display',
        content: '<p>Judge Schroeder has seen everything. Her management of a complex multi-party appeal was a master class — she kept us all on schedule without ever feeling rushed.</p><p>If you\'re briefing a procedural issue, expect her to know your case better than you do.</p>',
        rating: 5,
        type: 'positive',
        likes: 54,
        comments: 6,
      },

      // Stanley Mosk (LA County)
      {
        judge: 'Hon. Samantha P. Jessner',
        title: 'Patient, Knowledgeable, and Professional',
        content: '<p>Presiding Judge Jessner ran our department day cleanly. Calendar moved, every party got time, and rulings came with reasoning attached — not just outcomes.</p><ul><li>Started on time.</li><li>Ended on time.</li><li>Substantive engagement with every motion.</li></ul>',
        rating: 5,
        type: 'positive',
        likes: 89,
        comments: 14,
      },
      {
        judge: 'Hon. Samantha P. Jessner',
        title: 'Disappointing Experience in Department 15',
        content: '<p>Hate to leave this — but the courtroom was running 90 minutes behind by 10am and our matter never got reached. Came back the next day and the same thing happened.</p><p>I understand the docket pressure, but a five-minute call to inform parties would have saved everyone a full day of wasted time.</p>',
        rating: 2,
        type: 'negative',
        likes: 31,
        comments: 22,
      },

      // NY County Supreme
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Engaged and Unafraid',
        content: '<p>Judge Engoron actively engages with the substance of every argument. He\'s not afraid to push back on either side when he thinks the law isn\'t on their side.</p><p>Bring your A-game on the facts — he\'ll find any weakness.</p>',
        rating: 4,
        type: 'positive',
        likes: 67,
        comments: 11,
      },
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Fair Shake — Even When We Lost',
        content: '<p>We didn\'t prevail, but the court gave our argument a real hearing. The order had a reasoned analysis of every point we raised, which is more than I can say for some other courtrooms.</p><p>Process matters, and Judge Engoron respects it.</p>',
        rating: 4,
        type: 'positive',
        likes: 45,
        comments: 7,
      },

      // SDNY
      {
        judge: 'Hon. Lewis A. Kaplan',
        title: 'Top-Tier Professionalism',
        content: '<p>Judge Kaplan runs his courtroom with quiet authority. No raised voices, no theatrics — just consistent, clear expectations and the procedural rigor to back them up.</p><p>Read his standing orders before you file <em>anything</em>. He follows them, and so should you.</p>',
        rating: 5,
        type: 'positive',
        likes: 112,
        comments: 16,
      },
      {
        judge: 'Hon. Lewis A. Kaplan',
        title: 'Justice & Patience',
        content: '<p>A complex commercial dispute with 14 motions in limine. Judge Kaplan worked through each of them on the record with thoughtful analysis. Took most of a day. Worth every minute.</p>',
        rating: 5,
        type: 'positive',
        likes: 38,
        comments: 4,
      },

      // DDC / DC Circuit
      {
        judge: 'Hon. Tanya S. Chutkan',
        title: 'Court Was Run Like a Tight Ship',
        content: '<p>Tight docket, no nonsense, but always fair. Judge Chutkan moves cases efficiently without sacrificing the substance of any party\'s arguments.</p><p>Show up prepared or be politely (but firmly) corrected.</p>',
        rating: 5,
        type: 'positive',
        likes: 91,
        comments: 13,
      },
      {
        judge: 'Hon. Tanya S. Chutkan',
        title: '5 Stars Across the Board',
        content: '<p>Procedurally sharp, substantively engaged, and unafraid to issue tough rulings when the law requires it. Highest recommendation.</p>',
        rating: 5,
        type: 'positive',
        likes: 73,
        comments: 8,
      },

      // A few neutral / mixed entries to round out the dataset
      {
        judge: 'Hon. John G. Roberts Jr.',
        title: 'Excellent — Strongly Recommend',
        content: '<p>Bench demeanor is exactly what you\'d hope for at this level: calm, prepared, willing to interrupt only when an answer is being dodged. Oral argument felt like an actual dialogue rather than a performance.</p>',
        rating: 5,
        type: 'positive',
        likes: 156,
        comments: 24,
      },
      {
        judge: 'Hon. Elena Kagan',
        title: 'Knew Our Case Cold',
        content: '<p>Sometimes you can tell within the first thirty seconds of argument whether the bench has read your briefs. With Justice Kagan, you can tell within the first ten — and not just read them, internalized them.</p>',
        rating: 5,
        type: 'positive',
        likes: 82,
        comments: 9,
      },
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Mixed Bag, Honestly',
        content: '<p>Some days the courtroom hums. Other days it feels like everything is taking three times as long as it should. Hard to predict which you\'ll get.</p><p>Substantively the rulings have been fair when we\'ve appeared.</p>',
        rating: 3,
        type: 'neutral',
        likes: 19,
        comments: 5,
      },
    ]

    for (const r of reviews) {
      const judgeId = judgeByName.get(r.judge)
      if (!judgeId)
        continue

      const existing = await db.selectFrom('judge_reviews' as any)
        .select(['id'] as any)
        .where('judge_id' as any, '=', judgeId)
        .where('title' as any, '=', r.title)
        .executeTakeFirst()
      if (existing)
        continue

      await db.insertInto('judge_reviews' as any).values({
        title: r.title,
        content: r.content,
        rating: r.rating,
        type: r.type,
        status: 'published',
        likes: r.likes,
        comments: r.comments,
        judge_id: judgeId,
        user_id: null,
        uuid: crypto.randomUUID(),
      } as any).execute()
    }
  }
}
