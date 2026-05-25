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
        content: '<p>Chief Justice Roberts brings a measured, institutional temperament to every proceeding. His questions during oral argument cut to the heart of the matter without grandstanding, and the courtroom runs on time — every time. I\'ve appeared before him three times across two terms, and the experience has been remarkably consistent: clerks well-prepared, schedule honored to the minute, demeanor unfailingly even.</p><p>What struck me most was his evident commitment to <strong>collegiality</strong>. Even in sharply contested cases, he treats counsel on both sides with the same baseline of respect. He gives equal floor time, asks both sides equally hard questions, and gently corrects rather than embarrasses when an attorney misstates a precedent.</p><p>His opinions reflect the same temperament. He writes for the Court, not for posterity — declarative, sparing, and as narrow as the case allows. If you\'re hoping for sweeping dicta to cite later, you may be disappointed. If you\'re hoping for a clean, defensible ruling on the question presented, you\'ll usually get one.</p><p>A small but telling detail: he reads back to counsel what he understands their position to be before pressing them on it. That habit alone separates great judges from merely capable ones. <em>Highly recommended.</em></p>',
        rating: 5,
        type: 'positive',
        likes: 142,
        comments: 18,
      },
      {
        judge: 'Hon. Sonia Sotomayor',
        title: 'Sharp Questioning, Deep Engagement',
        content: '<p>Justice Sotomayor is famously prepared, and it shows from the first question. Her questions during oral argument were the most pointed of the bench — she had clearly read every brief, every amicus filing, and was tracking the record citation by citation. There is no skating by on rhetoric in her courtroom; she will quote your own footnote back at you.</p><blockquote>She doesn\'t let counsel hide behind generalities. If you say "the record shows," she will ask <em>where</em> in the record, and she will be holding the page when she asks.</blockquote><p>Her style is not adversarial so much as relentlessly substantive. She pushes hard, but she\'s also genuinely curious — when you give her a clean answer, you can see her mentally update. I\'ve watched her reverse her own apparent position mid-argument because counsel gave a better answer than she expected. That\'s a rare quality on any court.</p><p>Highly recommend appearing before her if you have a strong record and clean theory. Less so if you don\'t — she will find the gap, and she will make you stand in it.</p>',
        rating: 5,
        type: 'positive',
        likes: 98,
        comments: 12,
      },
      {
        judge: 'Hon. Elena Kagan',
        title: 'Plainspoken & Persuasive',
        content: '<p>What I appreciated most: Justice Kagan talks like a normal person. No black-robe theatrics, no Latin where English would do, no performative complexity for an audience of casebook editors. Just direct, clear questions in a register that everyone in the room — including, importantly, the parties themselves — can follow.</p><p>Her hypotheticals are works of craft. Most appellate hypotheticals collapse on inspection. Hers don\'t. They isolate the variable, push on it, and reveal whether your rule survives at the edges. I\'ve seen her construct one in real time that genuinely changed how I thought about the case I had briefed for six months.</p><p>Her dissents are required reading — clinically argued, occasionally funny, and never longer than they need to be. She trusts the reader, which is a courtesy in this line of work. If you\'re looking for a model of judicial writing that is rigorous without being airless, she is the one I would pick.</p><p>A final note: she manages the rhythm of oral argument better than almost anyone on the current Court. When a colleague is dominating the floor, she finds the gap. When counsel is drowning, she throws a clean question that lets them reset. That\'s craft.</p>',
        rating: 5,
        type: 'positive',
        likes: 76,
        comments: 9,
      },

      // 9th Circuit
      {
        judge: 'Hon. Mary M. Schroeder',
        title: 'Decades of Experience on Display',
        content: '<p>Judge Schroeder has seen everything. Her management of a complex multi-party appeal — six appellants, three cross-appellants, a procedurally tangled record — was a master class. She kept us all on schedule without ever feeling rushed, and she did it without raising her voice once.</p><p>If you\'re briefing a procedural issue, expect her to know your case better than you do. She has been on this circuit longer than most lawyers arguing before her have been members of the bar, and the institutional memory is real. She remembers when a precedent you\'re citing was originally decided and what the panel thought of the side issue you didn\'t brief.</p><p>Her panels run cleanly. The questions are coordinated rather than competing — you don\'t get whipsawed from one judge\'s framing to the next. When she presides, the conference feels like a conversation with a goal, not a survey of opinions.</p><p>One stylistic note: she is patient with new lawyers and short with sloppy ones. Both responses are well-calibrated. If you\'re a junior associate doing your first argument, she will give you room to find your footing. If you\'re a senior partner phoning it in on a brief your associate wrote, she will notice.</p>',
        rating: 5,
        type: 'positive',
        likes: 54,
        comments: 6,
      },

      // Stanley Mosk (LA County)
      {
        judge: 'Hon. Samantha P. Jessner',
        title: 'Patient, Knowledgeable, and Professional',
        content: '<p>Presiding Judge Jessner ran our department day cleanly. The calendar moved, every party got time, and rulings came with reasoning attached — not just outcomes. In a county where the trial courts can feel like a meat grinder, that combination is genuinely rare.</p><ul><li>Started on time.</li><li>Ended on time.</li><li>Substantive engagement with every motion, no matter how routine.</li><li>Clear written orders within a reasonable window.</li></ul><p>Beyond the operational excellence, what stood out was her temperament with self-represented litigants. We had two pro per parties on the calendar that morning, and she gave both of them the same care and procedural guidance she gave the firms — without ever crossing the line into advocacy for either side. That balance is hard, and she made it look routine.</p><p>Her courtroom staff also deserves credit. The clerk knew the docket cold, the bailiff kept the room moving, and the court reporter caught everything. A presiding judge sets the tone for those team dynamics, and you can feel it walking in.</p><p>I would happily appear before Judge Jessner again. Civil bar of LA County is lucky to have her.</p>',
        rating: 5,
        type: 'positive',
        likes: 89,
        comments: 14,
      },
      {
        judge: 'Hon. Samantha P. Jessner',
        title: 'Disappointing Experience in Department 15',
        content: '<p>Hate to leave this — but the courtroom was running 90 minutes behind by 10am and our matter never got reached. We came back the next day and the same thing happened. By the time we got on the record, our client had taken two days off work, our witnesses had been paid for two days of standby, and we were no closer to a ruling than we had been the previous Monday.</p><p>I understand the docket pressure. Every department in this courthouse is overloaded; I\'ve practiced in this county for fifteen years and I know the realities. But a five-minute call from chambers to inform parties of an expected delay would have saved everyone a full day of wasted time, and that call did not come.</p><p>When we finally got on the record, the ruling itself was reasoned and even-handed. I want to be clear that this is not a complaint about substantive judging — it\'s about the operational side of running a department. The clerk\'s office told us they have flagged this issue repeatedly without much change.</p><p>Two stars, and I would still appear here again because the substantive work is sound. But the calendar management has to improve, or the courthouse loses credibility with the bar.</p>',
        rating: 2,
        type: 'negative',
        likes: 31,
        comments: 22,
      },

      // NY County Supreme
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Engaged and Unafraid',
        content: '<p>Judge Engoron actively engages with the substance of every argument. He\'s not afraid to push back on either side when he thinks the law isn\'t on their side, and he doesn\'t soften the pushback to spare anyone\'s ego. If you\'re used to a bench that takes papers under submission and rules in three weeks, this courtroom will feel different.</p><p>Bring your A-game on the facts — he\'ll find any weakness. He clearly reads the record himself, not just the briefs, and he will reference exhibits by their exhibit number from memory. If your client\'s declaration is inconsistent with a contemporaneous email in the record, he will notice and he will ask you about it on the record.</p><p>What I appreciated: he tells you what he thinks and gives you a fair chance to talk him out of it. That\'s actually less common than it should be. Many judges hold their views close until the order issues. Engoron lets you litigate the actual issue in his head, which means you can make your best argument rather than guess at what concerns him.</p><p>Four stars. I\'d go higher except the calendar can run long, and the running commentary, while substantively helpful, sometimes adds to the delay.</p>',
        rating: 4,
        type: 'positive',
        likes: 67,
        comments: 11,
      },
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Fair Shake — Even When We Lost',
        content: '<p>We didn\'t prevail, but the court gave our argument a real hearing. The order had a reasoned analysis of every point we raised, which is more than I can say for some other courtrooms in this county. Losing a motion stings; losing it without feeling heard is much worse, and Judge Engoron does not do the second thing.</p><p>His questions during argument made it obvious he had read everything. He asked about a procedural footnote in our reply brief that I had honestly half-expected nobody to notice. When we couldn\'t fully answer, he didn\'t use it as a gotcha — he marked it as something we should address in supplemental briefing and moved on. That\'s the kind of judge I want my clients in front of, whether we win or lose.</p><p>Process matters, and Judge Engoron respects it. If you go in with a weak motion, you will lose, but you will lose on the merits and you will know exactly why. If your motion is strong, you have a real shot regardless of which side of the "v." you\'re on.</p><p>Recommended, with the caveat that you should be ready to actually argue your case on the record rather than just file and hope.</p>',
        rating: 4,
        type: 'positive',
        likes: 45,
        comments: 7,
      },

      // SDNY
      {
        judge: 'Hon. Lewis A. Kaplan',
        title: 'Top-Tier Professionalism',
        content: '<p>Judge Kaplan runs his courtroom with quiet authority. No raised voices, no theatrics — just consistent, clear expectations and the procedural rigor to back them up. The bar in this district learns the rules of his courtroom early because they are uniformly enforced.</p><p>Read his standing orders before you file <em>anything</em>. He follows them, and so should you. The standing orders are not aspirational; they are the operating system of this courtroom. If they say motions must be accompanied by a memorandum not exceeding twenty-five pages, your twenty-six-page memo will be returned. If they say discovery disputes are addressed by joint letter, your unilateral letter will go nowhere.</p><p>What separates him is the substantive work behind the procedural discipline. Once you\'re inside the lines, he engages with the merits at a very high level. His questions on a Daubert motion in a recent matter were as sophisticated as I\'ve seen — he had clearly read the underlying expert reports and was asking about methodology, not just credentials.</p><p>If your case is well-prepared, this is one of the best courtrooms in the country to be in. If it isn\'t, you will find that out quickly and at some cost.</p>',
        rating: 5,
        type: 'positive',
        likes: 112,
        comments: 16,
      },
      {
        judge: 'Hon. Lewis A. Kaplan',
        title: 'Justice & Patience',
        content: '<p>A complex commercial dispute with fourteen motions in limine, six fact witnesses and three experts, and a trial schedule that nobody thought was realistic. Judge Kaplan worked through each motion on the record with thoughtful analysis. It took most of a day. Worth every minute.</p><p>What was remarkable was the patience. He did not short-circuit any of the motions to save time, even when the issue was relatively contained. He let counsel make the argument fully, asked the questions he needed to ask, and ruled cleanly. By the end of the day every one of the motions had been resolved, and every party knew exactly what the boundaries of the upcoming trial would be.</p><p>That preparation pays off at trial. We did not have a single mid-trial dispute about what was admissible — every contested issue had already been litigated, and counsel had no excuse for trying to relitigate. The trial itself ran a day shorter than the original estimate.</p><p>A model of how an experienced federal judge can use pretrial time to make a complex case tractable. Highest recommendation.</p>',
        rating: 5,
        type: 'positive',
        likes: 38,
        comments: 4,
      },

      // DDC / DC Circuit
      {
        judge: 'Hon. Tanya S. Chutkan',
        title: 'Court Was Run Like a Tight Ship',
        content: '<p>Tight docket, no nonsense, but always fair. Judge Chutkan moves cases efficiently without sacrificing the substance of any party\'s arguments. The matters in front of her tend to be high-stakes, and she treats them that way without letting the stakes pull the proceedings off the rails.</p><p>Show up prepared or be politely (but firmly) corrected. She gives counsel every opportunity to be ready; she does not give second chances to be unready. If your scheduling motion is filed two days late, you will explain why on the record. If your declaration cites a statute that was amended in the last session, she will know and she will ask.</p><p>What I particularly appreciate is the consistency. Whether the matter is a routine status conference or a contested motion with national attention, the courtroom operates identically. Same standards, same temperament, same pace. That consistency is reassuring to the bar and protective of the parties.</p><p>Her written orders are crisp and precise. She does not pad rulings with unnecessary dicta, and she does not avoid the hard parts of an analysis. Recommended without reservation, especially in matters where rigorous case management is at a premium.</p>',
        rating: 5,
        type: 'positive',
        likes: 91,
        comments: 13,
      },
      {
        judge: 'Hon. Tanya S. Chutkan',
        title: '5 Stars Across the Board',
        content: '<p>Procedurally sharp, substantively engaged, and unafraid to issue tough rulings when the law requires it. Highest recommendation, and I do not give five stars often.</p><p>I have appeared in front of dozens of federal district judges across half a dozen circuits. Judge Chutkan is in the top tier on every dimension that actually matters: preparation, pace, demeanor with counsel, willingness to engage with the hard issue rather than punt to summary judgment.</p><p>Two observations from a recent matter. First, her hot-bench questioning at the motion-to-dismiss stage was the most rigorous I\'ve seen. She doesn\'t treat MTDs as procedural formalities — she actually pressure-tests the claims at the threshold, and the orders reflect that work. Second, she manages expert testimony with a clarity that benefits the record. We had three experts of varying quality; her interventions made the testimony usable.</p><p>If you want a courtroom where the law and the record do the work — and personalities, including the bench\'s own, stay out of the way — this is the courtroom you want.</p>',
        rating: 5,
        type: 'positive',
        likes: 73,
        comments: 8,
      },

      // A few neutral / mixed entries to round out the dataset
      {
        judge: 'Hon. John G. Roberts Jr.',
        title: 'Excellent — Strongly Recommend',
        content: '<p>Bench demeanor is exactly what you\'d hope for at this level: calm, prepared, willing to interrupt only when an answer is being dodged. Oral argument felt like an actual dialogue rather than a performance, which is not the universal experience at this Court.</p><p>His questions function as guideposts rather than tests. When he asks about a hypothetical, it is because the answer matters for how he is thinking about the rule, not because he is testing your composure. That orientation tends to elevate the quality of the argument on both sides — counsel can engage with the substance rather than defend against the bench.</p><p>I was particularly impressed by how he managed time. He has a near-perfect sense of when an exchange has produced everything it can produce, and he closes it cleanly without making counsel feel cut off. That micro-skill, accumulated over an entire argument, ends up being the difference between a productive hour and a frustrating one.</p><p>The opinions that follow have the same quality of restraint. He decides what the case requires and stops. That is a discipline more judges should aspire to. Strongly recommend.</p>',
        rating: 5,
        type: 'positive',
        likes: 156,
        comments: 24,
      },
      {
        judge: 'Hon. Elena Kagan',
        title: 'Knew Our Case Cold',
        content: '<p>Sometimes you can tell within the first thirty seconds of argument whether the bench has read your briefs. With Justice Kagan, you can tell within the first ten — and not just read them, internalized them. She asked her first question with a record citation, and it was correct.</p><p>What was unusual was the precision of her engagement with the dissent below. She had identified a single sentence in the dissent that, in her view, isolated the real question presented better than the majority did. She built her line of questioning around testing that sentence against our theory. We had not flagged that exchange ourselves; she found it.</p><p>That level of preparation creates a different kind of pressure on counsel. You cannot answer her on autopilot. Each answer has to be calibrated to what she has clearly already considered, which means your reply brief had better have anticipated the issues that a careful reader would surface. If it didn\'t, you will be working it out live, which is not where you want to be.</p><p>She is the standard against which I now measure preparedness on any appellate bench. Highest recommendation.</p>',
        rating: 5,
        type: 'positive',
        likes: 82,
        comments: 9,
      },
      {
        judge: 'Hon. Arthur F. Engoron',
        title: 'Mixed Bag, Honestly',
        content: '<p>Some days the courtroom hums. Other days it feels like everything is taking three times as long as it should. Hard to predict which you\'ll get on any given calendar call, and the variance creates real planning problems for litigants who have to budget client time around it.</p><p>Substantively the rulings have been fair when we\'ve appeared. I have no complaint about the analysis or the outcomes; in three matters across two years we received reasoned orders, and even when we lost, we lost on grounds that were clearly articulated. That is more than I can say for some courtrooms in this county.</p><p>The reason this is three stars and not four is the operational unpredictability. A trial-level civil practice is, at this point, a logistics business; the law is necessary but not sufficient. Lawyers schedule witnesses, experts, clients, and translators based on the calendar the courthouse publishes. When the courtroom regularly runs an hour or more behind without notice, those logistics turn into pure waste, paid for by the parties.</p><p>I would still recommend Judge Engoron on substance. I would recommend building a half-day buffer into any matter on his calendar.</p>',
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
        .executeTakeFirst() as { id: number } | undefined

      // Update path: when the seeded content changes (e.g. we lengthen
      // the bodies), running the seeder again should refresh the rows
      // rather than silently skip them. Match by `(judge_id, title)`
      // and overwrite the fields the seeder owns. We deliberately leave
      // `uuid` and timestamps alone — they're the row's identity to
      // anything that has linked to it (e.g. /article/:id bookmarks).
      if (existing) {
        await db.updateTable('judge_reviews' as any)
          .set({
            content: r.content,
            rating: r.rating,
            type: r.type,
            comments: r.comments,
          } as any)
          .where('id' as any, '=', existing.id)
          .execute()
        continue
      }

      // `likes` is intentionally not seeded — there is no denormalised
      // counter anymore (see app/Helpers/reviewLikes.ts). Real
      // reactions land as rows in `judge_reviews_likes` from the
      // toggle endpoint; seeded reviews start with zero reactions.
      // The `r.likes` field on the data array is dead weight — keeping
      // it so the array shape stays human-readable for future tweaks
      // (e.g. if we ever pre-seed reactions for staging demos).
      await db.insertInto('judge_reviews' as any).values({
        title: r.title,
        content: r.content,
        rating: r.rating,
        type: r.type,
        status: 'published',
        comments: r.comments,
        judge_id: judgeId,
        user_id: null,
        uuid: crypto.randomUUID(),
      } as any).execute()
    }
  }
}
