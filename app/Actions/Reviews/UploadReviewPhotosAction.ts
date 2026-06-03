import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { processAndPersistReviewPhoto } from '../../Helpers/reviewPhotos'

/**
 * POST /api/reviews/{id}/photos — attach photos to an existing review.
 *
 * Auth-gated. Author-only — non-owners get 404 in the same shape as
 * a missing review. Up to 4 photos per review total (counts existing
 * + the current upload batch); excess gets rejected before any disk
 * write happens.
 *
 * Each uploaded file runs through `processAndPersistReviewPhoto`:
 * EXIF strip → resize to 3 sizes → write local WebPs → return URL
 * triple. The action then persists one `review_photos` row per
 * successful processing.
 *
 * Resolves bench-review#31 (upload half).
 */
const MAX_PHOTOS_PER_REVIEW = 4

export default new Action({
  name: 'Upload Review Photos',
  description: 'Attach one or more photos to an existing review',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const reviewId = Number(request.params?.id)

    // Verify ownership + grab the review's uuid for the storage path.
    const review = await db.selectFrom('judge_reviews')
      .select(['id', 'user_id', 'uuid'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, uuid: string | null } | undefined

    if (!review || review.user_id == null || Number(review.user_id) !== Number(userId))
      return response.json({ error: 'Review not found' }, 404)

    // Per-review photo cap. Counts existing rows so a user who
    // already has 3 photos can only add 1 more in this batch.
    const existing = await db.selectFrom('review_photos')
      .select(['COUNT(*) as c'])
      .where('judge_review_id', '=', reviewId)
      .executeTakeFirst() as { c: number | string } | undefined
    const existingCount = Number(existing?.c ?? 0)
    const slotsRemaining = MAX_PHOTOS_PER_REVIEW - existingCount
    if (slotsRemaining <= 0)
      return response.json({ error: `This review already has ${MAX_PHOTOS_PER_REVIEW} photos. Delete one to add another.` }, 422)

    // Multipart parse. The router proxy on `request` exposes a
    // `formData()` helper; fall back to reading the raw body if not.
    const formData = await (request as any).formData?.().catch(() => null)
    if (!formData)
      return response.json({ error: 'Multipart body required.' }, 400)

    const incoming = formData.getAll('photos') as File[]
    if (incoming.length === 0)
      return response.json({ error: 'No photos in the upload.' }, 422)
    if (incoming.length > slotsRemaining)
      return response.json({ error: `Can only add ${slotsRemaining} more ${slotsRemaining === 1 ? 'photo' : 'photos'} to this review.` }, 422)

    const reviewUuid = review.uuid || `review-${reviewId}`
    const persisted: any[] = []
    const failures: string[] = []
    const now = new Date().toISOString()

    for (let i = 0; i < incoming.length; i++) {
      const file = incoming[i]
      try {
        const result = await processAndPersistReviewPhoto(reviewUuid, file, file.type)
        await db.insertInto('review_photos').values({
          judge_review_id: reviewId,
          user_id: Number(userId),
          thumb_url: result.thumb_url,
          card_url: result.card_url,
          full_url: result.full_url,
          mime: result.mime,
          width: result.width,
          height: result.height,
          order_index: existingCount + i,
          created_at: now,
        } as any).execute()
        persisted.push(result)
      }
      catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }

    if (persisted.length === 0)
      return response.json({ error: failures.join(' / ') || 'All uploads failed.' }, 422)

    return response.json({
      ok: true,
      added: persisted.length,
      failures,
      photos: persisted,
    }, 201)
  },
})
