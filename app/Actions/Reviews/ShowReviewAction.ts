import { Action } from '@stacksjs/actions'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'

/**
 * GET /api/reviews/:id — one published review, joined with its judge.
 *
 * Returns a flat row plus a nested `judge` object so the article view
 * can render header + body in a single response. Judge data is read
 * via a separate query rather than a SQL JOIN because the ORM's join
 * surface is rough and the cost of two indexed lookups is negligible
 * for a single-row read.
 *
 * `likes` and `liked_by_me` are hydrated via the same helper used by
 * the list endpoints. Single-row case is a degenerate page-of-one;
 * reusing the helper keeps the count source consistent across every
 * read path (no chance of the article view showing one number while
 * the feed shows another).
 *
 * Returns 404 for missing or non-published rows so unmoderated content
 * doesn't accidentally surface via a guessed id.
 */
export default new Action({
  name: 'Show Review',
  description: 'One published review with judge context',
  method: 'GET',
  async handle() {
    const raw = String((request as any).params?.id || '')
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0)
      return response.json({ error: 'Invalid review id' }, 400)

    const review = await JudgeReview.where('id', id)
      .where('status', 'published')
      .first()
    if (!review)
      return response.json({ error: 'Not Found' }, 404)

    const [hydrated] = await hydrateLikeData([review as any])

    let judge: any = null
    if (hydrated.judge_id) {
      const j = await Judge.where('id', hydrated.judge_id).first()
      if (j) {
        const jr = (j as any).toJSON ? (j as any).toJSON() : j
        judge = { id: jr.id, name: jr.name, court: jr.court ?? null, image_url: jr.image_url ?? null }
      }
    }

    return response.json({ ...hydrated, judge })
  },
})
