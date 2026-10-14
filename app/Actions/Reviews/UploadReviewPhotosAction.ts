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
 * **A photo added to a PUBLISHED review sends it back to pending.** Text
 * edits have always done this (UpdateMyReviewAction); photos did not, so the
 * one channel that could put an unreviewed image on a live page about a named
 * judge was also the one channel that bypassed moderation entirely. An
 * uploader could publish text, wait for approval, then attach anything.
 * Images are the highest-risk content this site accepts — a face, a document,
 * an address — and they were the only kind no moderator ever saw
 * (bench-review#51).
 *
 * Resolves bench-review#31 (upload half).
 */
const MAX_PHOTOS_PER_REVIEW = 4

/**
 * Photos one account may hold across every review it has written
 * (bench-review#56).
 *
 * The per-review cap above bounds a single review and nothing else: an author
 * with twenty reviews could hold eighty images, and the route had no quota at
 * all behind its throttle. Each accepted photo is three WebP renditions kept
 * indefinitely, so the unbounded quantity here is storage, paid for by us.
 *
 * Counted rather than measured in bytes. A byte quota is the more precise
 * control, but it needs a size column the table does not have and a backfill
 * for every existing row, and it would not bound the thing it sounds like it
 * bounds — the CPU in a delete-and-reupload loop is capped by the route's
 * throttle, not by how much is on disk. Twelve photos is three full reviews'
 * worth, which is past any honest use of this feature and far short of
 * anything expensive.
 */
const MAX_PHOTOS_PER_USER = 12

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
      .select(['id', 'user_id', 'uuid', 'status'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, uuid: string | null, status: string | null } | undefined

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

    // Per-ACCOUNT cap, on top of the per-review one. Counts the user's rows
    // across every review, so the budget cannot be spread over many reviews.
    const owned = await db.selectFrom('review_photos')
      .select(['COUNT(*) as c'])
      .where('user_id', '=', Number(userId))
      .executeTakeFirst() as { c: number | string } | undefined
    const ownedCount = Number(owned?.c ?? 0)
    const userSlotsRemaining = MAX_PHOTOS_PER_USER - ownedCount
    if (userSlotsRemaining <= 0)
      return response.json({ error: `You have reached the ${MAX_PHOTOS_PER_USER}-photo limit across your reviews. Delete one to add another.` }, 422)
    if (incoming.length > userSlotsRemaining)
      return response.json({ error: `You can only add ${userSlotsRemaining} more ${userSlotsRemaining === 1 ? 'photo' : 'photos'} across your reviews.` }, 422)

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

    // Back into the queue, if it had left it. Done AFTER the writes, so a
    // review is never knocked offline by an upload that then failed — and
    // only when something actually landed, so a batch that was entirely
    // rejected leaves a published review alone.
    //
    // Matches what a text edit does, deliberately: the author changed what
    // the page shows, so the page is unreviewed again. A pending or rejected
    // review is already out of public view and needs no touch.
    const returnedToQueue = review.status === 'published' && persisted.length > 0
    if (returnedToQueue) {
      await db.updateTable('judge_reviews')
        .set({ status: 'pending', updated_at: new Date().toISOString() } as any)
        .where('id', '=', reviewId)
        .execute()
    }

    return response.json({
      ok: true,
      added: persisted.length,
      failures,
      // The client needs to know: the author just took their own review off
      // the site, and silently doing that would be worse than not doing it.
      returned_to_queue: returnedToQueue,
      photos: persisted,
    }, 201)
  },
})
