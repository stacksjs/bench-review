import { defineStore, derived, state } from '@stacksjs/stx'

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
}

export interface SubmitReviewPayload {
  judge_id: number
  title: string
  content: string
  rating: number
  type?: 'positive' | 'negative' | 'neutral'
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
      const res = await fetch(`/api/reviews?limit=${limit}`)
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
      const res = await fetch(`/api/reviews/${id}`)
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

  async function fetchByJudge(judgeId: number): Promise<void> {
    // Mark this judge as in-flight without overwriting other judges'
    // load state — multiple panels can request different judges in
    // parallel without flickering each other's spinners.
    loadingByJudge.set({ ...loadingByJudge(), [judgeId]: true })
    try {
      const res = await fetch(`/api/judges/${judgeId}/reviews`)
      if (!res.ok) return
      const data = await res.json() as JudgeReviewRow[]
      byJudge.set({ ...byJudge(), [judgeId]: Array.isArray(data) ? data : [] })
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

  async function submit(payload: SubmitReviewPayload): Promise<SubmitResult> {
    submitting.set(true)
    try {
      // The API server validates `Authorization: Bearer …` not the
      // cookie — they're two separate auth surfaces. The cookie keeps
      // the stx-serve front-end auth gate happy; the header proves the
      // session to bun-router. Read straight from `document.cookie`
      // rather than the auth store to avoid the cross-store import.
      const cookieMatch = typeof document !== 'undefined'
        ? document.cookie.match(/(?:^|; )auth-token=([^;]*)/)
        : null
      const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : ''

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
      if (token)
        headers.Authorization = `Bearer ${token}`

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers,
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
    reviewsForJudge,
    isLoadingJudge,
  }
})
