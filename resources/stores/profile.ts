import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export interface ProfileReviewRow {
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
  judge?: {
    id: number
    name: string
    court?: string | null
    image_url?: string | null
  } | null
}

/**
 * Profile store — owns the current user's review history + computed
 * stats. Powered by /api/me/reviews (auth-gated). Stats are derived,
 * not stored, so they stay consistent with the underlying list.
 */
defineStore('profile', () => {
  const myReviews = state<ProfileReviewRow[]>([])
  const loading = state<boolean>(false)
  const loaded = state<boolean>(false)

  async function fetchMyReviews(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/me/reviews')
      if (!res.ok) {
        myReviews.set([])
        return
      }
      const data = await res.json() as ProfileReviewRow[]
      myReviews.set(Array.isArray(data) ? data : [])
    }
    catch (err) {
      console.error('[profile] fetchMyReviews failed:', err)
      myReviews.set([])
    }
    finally {
      loading.set(false)
      loaded.set(true)
    }
  }

  // Derived stats — recomputed whenever myReviews changes.
  const totalReviews = derived<number>(() => myReviews().length)

  const judgesReviewed = derived<number>(() => {
    const ids = new Set<number>()
    for (const r of myReviews()) {
      if (r.judge_id != null)
        ids.add(r.judge_id)
    }
    return ids.size
  })

  const averageRating = derived<number>(() => {
    const rows = myReviews()
    if (rows.length === 0) return 0
    const sum = rows.reduce((acc, r) => acc + (r.rating || 0), 0)
    return Math.round((sum / rows.length) * 10) / 10
  })

  const totalLikes = derived<number>(() => {
    let n = 0
    for (const r of myReviews())
      n += r.likes || 0
    return n
  })

  return {
    myReviews,
    loading,
    loaded,
    totalReviews,
    judgesReviewed,
    averageRating,
    totalLikes,
    fetchMyReviews,
  }
})
