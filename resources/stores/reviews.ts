import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export interface JudgeReviewRow {
  id: number
  uuid?: string | null
  title: string
  content: string
  rating: number
  likes?: number
  comments?: number
  type?: string
  status?: string
  judge_id: number
  user_id?: number | null
  created_at?: string | null
  updated_at?: string | null
  // Server-hydrated when the request carried an auth token. Drives
  // the "people find this helpful" button's filled/empty state on
  // hard reload of an article page. Anonymous reads come back false
  // and the UI prompts to sign in on first click.
  liked_by_me?: boolean
}

export interface LikeResult {
  ok: boolean
  liked?: boolean
  likes?: number
  error?: string
}

export interface SubmitReviewPayload {
  judge_id: number
  title: string
  content: string
  rating: number
  type?: 'positive' | 'negative' | 'neutral'
  // bench-review#36 — when true, public surfaces render the author
  // as "Anonymous <role_label>" instead of their real name.
  anonymized?: boolean
}

export interface SubmitResult {
  ok: boolean
  error?: string
  errors?: Record<string, string>
  review?: JudgeReviewRow
}

/**
 * Reviews store — lazy by design.
 *
 * Three independent slices feed three independent UI shapes:
 *
 *   `latest`           — flat list for the home page strip
 *   `byJudge[judgeId]` — keyed cache for judge detail pages
 *   loading flags      — per-slice so spinners don't flash on cached hits
 *
 * Nothing eager-loads. Each component calls the matching fetcher in
 * `onMount` and the empty-state UI carries the page until data arrives.
 * `submit()` writes through and (best-effort) appends to the in-memory
 * caches so the SPA doesn't need a round-trip to reflect the new row —
 * even though the row is `status=pending` and won't surface to other
 * sessions until moderated.
 */
defineStore('reviews', () => {
  const latest = state<JudgeReviewRow[]>([])
  const byJudge = state<Record<number, JudgeReviewRow[]>>({})
  const loadingLatest = state<boolean>(false)
  const loadingByJudge = state<Record<number, boolean>>({})
  const submitting = state<boolean>(false)

  // Single-review slice. The article page fetches one row at a time
  // through `fetchById`, and the page reads `current()` to render.
  // `currentNotFound` is sticky across the request lifecycle so the
  // page can show a 404 state without racing the loading flag.
  const current = state<(JudgeReviewRow & { judge?: { id: number, name: string, court?: string | null, image_url?: string | null } | null }) | null>(null)
  const loadingCurrent = state<boolean>(false)
  const currentNotFound = state<boolean>(false)

  async function fetchLatest(limit = 6): Promise<void> {
    loadingLatest.set(true)
    try {
      const res = await useStore('auth').authFetch(`/api/reviews?limit=${limit}`)
      if (!res.ok) return
      const data = await res.json() as JudgeReviewRow[]
      latest.set(Array.isArray(data) ? data : [])
    }
    catch (err) {
      console.error('[reviews] fetchLatest failed:', err)
    }
    finally {
      loadingLatest.set(false)
    }
  }

  async function fetchById(id: number): Promise<void> {
    // Reset before fetching so a stale `current` from a previous
    // article doesn't flash while the new one loads.
    current.set(null)
    currentNotFound.set(false)
    loadingCurrent.set(true)
    try {
      const res = await useStore('auth').authFetch(`/api/reviews/${id}`)
      if (res.status === 404) {
        currentNotFound.set(true)
        return
      }
      if (!res.ok) return
      const data = await res.json() as JudgeReviewRow & { judge?: any }
      current.set(data)
    }
    catch (err) {
      console.error('[reviews] fetchById failed:', err)
    }
    finally {
      loadingCurrent.set(false)
    }
  }

  async function fetchByJudge(judgeId: number, page = 1, perPage = 25): Promise<void> {
    // Mark this judge as in-flight without overwriting other judges'
    // load state — multiple panels can request different judges in
    // parallel without flickering each other's spinners.
    loadingByJudge.set({ ...loadingByJudge(), [judgeId]: true })
    try {
      const url = `/api/judges/${judgeId}/reviews?page=${page}&per_page=${perPage}`
      const res = await useStore('auth').authFetch(url)
      if (!res.ok) return
      // bench-review#28 — endpoint now returns the canonical paginator
      // (`{ data, current_page, total, ... }`) instead of a raw array.
      // The Array.isArray fallback keeps us safe if the endpoint shape
      // ever regresses or a future endpoint variant returns an array.
      const json = await res.json() as { data?: JudgeReviewRow[] } | JudgeReviewRow[]
      const rows = Array.isArray(json) ? json : (json?.data ?? [])
      byJudge.set({ ...byJudge(), [judgeId]: rows })
    }
    catch (err) {
      console.error(`[reviews] fetchByJudge(${judgeId}) failed:`, err)
    }
    finally {
      const next = { ...loadingByJudge() }
      delete next[judgeId]
      loadingByJudge.set(next)
    }
  }

  /**
   * Server-side compose-draft autosave (bench-review#26).
   *
   * Three thin wrappers around /api/me/draft. The editor stores a
   * per-tab copy in localStorage (fast) and chains here for cross-
   * device sync (canonical). On submit success, clearDraft() runs
   * so coming back to /review doesn't restore a stale draft on top
   * of the freshly submitted review.
   */
  async function fetchDraft(): Promise<{ ok: boolean, draft?: any }> {
    try {
      const res = await useStore('auth').authFetch('/api/me/draft')
      if (!res.ok) return { ok: false }
      const data = await res.json() as { ok?: boolean, draft?: any }
      return { ok: !!data?.ok, draft: data?.draft ?? null }
    }
    catch { return { ok: false } }
  }
  async function saveDraft(patch: { judge_id?: number | null, title?: string, content?: string, rating?: number | null, type?: string, anonymized?: boolean }): Promise<void> {
    try {
      await useStore('auth').authFetch('/api/me/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }
    catch { /* drafts are best-effort — localStorage is the safety net */ }
  }
  async function clearDraft(): Promise<void> {
    try {
      await useStore('auth').authFetch('/api/me/draft', { method: 'DELETE' })
    }
    catch { /* best-effort */ }
  }

  /**
   * Upload one or more photos for an existing review (bench-review#31).
   * Multipart payload; the server handles EXIF strip + 3-size resize
   * + storage. Returns the count of successfully persisted photos.
   */
  async function uploadPhotos(reviewId: number, formData: FormData): Promise<{ ok: boolean, added?: number, error?: string }> {
    try {
      // Don't set Content-Type — let the browser pick the multipart
      // boundary. authFetch's default headers don't include it.
      const res = await useStore('auth').authFetch(`/api/reviews/${reviewId}/photos`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, added?: number, error?: string }
      if (!res.ok || !data.ok)
        return { ok: false, error: data.error || 'Photo upload failed' }
      return { ok: true, added: data.added ?? 0 }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  async function submit(payload: SubmitReviewPayload): Promise<SubmitResult> {
    submitting.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string, errors?: Record<string, string>, review?: JudgeReviewRow }
      if (!res.ok)
        return { ok: false, error: data.error || 'Failed to submit review', errors: data.errors }

      // Optimistic cache update so the author sees their own row even
      // while it sits in `pending`. Other sessions won't get it until
      // the moderator publishes — see SubmitReviewAction.
      if (data.review) {
        const j = data.review.judge_id
        byJudge.set({
          ...byJudge(),
          [j]: [data.review, ...(byJudge()[j] ?? [])],
        })
      }
      return { ok: true, review: data.review }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
    finally {
      submitting.set(false)
    }
  }

  function reviewsForJudge(judgeId: number): JudgeReviewRow[] {
    return byJudge()[judgeId] ?? []
  }

  function isLoadingJudge(judgeId: number): boolean {
    return !!loadingByJudge()[judgeId]
  }

  /**
   * Author edit. Sends a partial patch (only changed fields), then
   * refreshes the local `current` slice with the server's response.
   * The server resets `status` to `pending` on every edit, so the
   * UI's status banner flips automatically.
   */
  async function updateOwn(reviewId: number, patch: { title?: string, content?: string, rating?: number, type?: string }): Promise<{ ok: boolean, error?: string }> {
    try {
      const res = await useStore('auth').authFetch(`/api/me/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, review?: any, error?: string }
      if (!res.ok || !data.ok)
        return { ok: false, error: data.error || 'Could not save changes' }

      const cur = current()
      if (cur && data.review && Number(cur.id) === Number(reviewId)) {
        current.set({ ...cur, ...data.review })
      }
      return { ok: true }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  /**
   * Author delete. Drops the row + cascaded pivots server-side, then
   * clears local caches so the UI doesn't keep a dangling reference.
   */
  async function deleteOwn(reviewId: number): Promise<{ ok: boolean, error?: string }> {
    try {
      const res = await useStore('auth').authFetch(`/api/me/reviews/${reviewId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok)
        return { ok: false, error: data.error || 'Could not delete review' }

      // Local-cache cleanup. If the deleted review was `current`,
      // null it out so the next render doesn't show a phantom row.
      // Also strip it from `latest` and any `byJudge` slice.
      if (current()?.id === reviewId) current.set(null)
      latest.set(latest().filter(r => r.id !== reviewId))
      const next = { ...byJudge() }
      for (const [k, rows] of Object.entries(next))
        next[Number(k)] = rows.filter(r => r.id !== reviewId)
      byJudge.set(next)

      return { ok: true }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  /**
   * Toggle "people find this helpful" for a review.
   *
   * The endpoint is auth-gated. If the caller is anonymous, the auth
   * store's `authFetch` will deliver a 401 — we surface that as
   * `{ ok: false, error: 'auth' }` so the calling component can prompt
   * the user to sign in instead of silently failing.
   *
   * On success, fans the new `{ liked, likes }` pair out to every
   * cache slice that might be showing this review (`current`,
   * `latest`, `byJudge[*]`). Doing the fan-out here rather than at the
   * call site keeps the UI reactive across navigations — clicking
   * like on the detail page and then hitting "← All reviews" shows
   * the updated count in the feed without a refetch.
   */
  async function toggleLike(reviewId: number): Promise<LikeResult> {
    try {
      const res = await useStore('auth').authFetch(`/api/reviews/${reviewId}/like`, {
        method: 'POST',
      })
      if (res.status === 401)
        return { ok: false, error: 'auth' }
      const data = await res.json().catch(() => ({})) as { liked?: boolean, likes?: number, error?: string }
      if (!res.ok)
        return { ok: false, error: data.error || 'Failed to update like' }

      const liked = !!data.liked
      const likes = Number(data.likes ?? 0)

      // Fan-out: patch `current`, `latest`, and every judge slice that
      // includes this review. Each `.set(...)` triggers a single
      // re-render; we only call it for slices that actually changed
      // so unrelated views don't churn.
      const cur = current()
      if (cur && cur.id === reviewId)
        current.set({ ...cur, likes, liked_by_me: liked })

      const prevLatest = latest()
      if (prevLatest.some(r => r.id === reviewId)) {
        latest.set(prevLatest.map(r =>
          r.id === reviewId ? { ...r, likes, liked_by_me: liked } : r,
        ))
      }

      const byJudgeMap = byJudge()
      let touched = false
      const nextByJudge: typeof byJudgeMap = {}
      for (const [k, rows] of Object.entries(byJudgeMap)) {
        if (rows.some(r => r.id === reviewId)) {
          nextByJudge[Number(k)] = rows.map(r =>
            r.id === reviewId ? { ...r, likes, liked_by_me: liked } : r,
          )
          touched = true
        }
        else {
          nextByJudge[Number(k)] = rows
        }
      }
      if (touched)
        byJudge.set(nextByJudge)

      return { ok: true, liked, likes }
    }
    catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  // Convenience derived so card UIs can show "Be the first" without
  // peeking into both slices themselves.
  const hasAnyLatest = derived<boolean>(() => latest().length > 0)

  return {
    latest,
    byJudge,
    loadingLatest,
    loadingByJudge,
    submitting,
    current,
    loadingCurrent,
    currentNotFound,
    hasAnyLatest,
    fetchLatest,
    fetchByJudge,
    fetchById,
    submit,
    updateOwn,
    deleteOwn,
    toggleLike,
    uploadPhotos,
    fetchDraft,
    saveDraft,
    clearDraft,
    reviewsForJudge,
    isLoadingJudge,
  }
})
