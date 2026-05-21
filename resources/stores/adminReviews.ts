import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export type ReviewStatusFilter = 'all' | 'pending' | 'published' | 'rejected'

export interface AdminReviewRow {
  id: number
  title: string
  content: string
  rating: number
  status: 'pending' | 'published' | 'rejected'
  type?: string | null
  likes?: number | null
  comments?: number | null
  created_at?: string | null
  updated_at?: string | null
  judge: { id: number | null, name: string }
  user: { id: number, name: string, email: string } | null
}

defineStore('adminReviews', () => {
  const reviews = state<AdminReviewRow[]>([])
  const total = state<number>(0)
  const loading = state<boolean>(false)
  const statusFilter = state<ReviewStatusFilter>('pending')
  const query = state<string>('')
  const page = state<number>(1)
  const perPage = state<number>(25)
  const actionError = state<string>('')

  const totalPages = derived<number>(() => Math.max(1, Math.ceil(total() / perPage())))

  let searchTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchReviews(): Promise<void> {
    loading.set(true)
    try {
      const params = new URLSearchParams({
        status: statusFilter(),
        page: String(page()),
        perPage: String(perPage()),
      })
      const q = query().trim()
      if (q) params.set('q', q)
      const res = await useStore('auth').authFetch(`/api/admin/reviews?${params.toString()}`)
      if (!res.ok) {
        actionError.set(`Failed to load reviews (${res.status})`)
        return
      }
      const data = await res.json() as { reviews: AdminReviewRow[], total: number }
      reviews.set(data.reviews)
      total.set(data.total)
      actionError.set('')
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
    }
    finally {
      loading.set(false)
    }
  }

  function setStatusFilter(next: ReviewStatusFilter): void {
    statusFilter.set(next)
    page.set(1)
    fetchReviews()
  }

  function setSearch(next: string): void {
    query.set(next)
    page.set(1)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { fetchReviews() }, 250)
  }

  function setPage(next: number): void {
    page.set(Math.max(1, next))
    fetchReviews()
  }

  async function setReviewStatus(id: number, status: 'published' | 'rejected'): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/reviews/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Status change failed')
        return false
      }
      // If the row falls outside the current filter after status change,
      // drop it from the visible list; otherwise update in place.
      const filter = statusFilter()
      if (filter !== 'all' && filter !== status) {
        reviews.set(reviews().filter(r => r.id !== id))
        total.set(Math.max(0, total() - 1))
      }
      else {
        reviews.set(reviews().map(r => r.id === id ? { ...r, status } : r))
      }
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  async function deleteReview(id: number): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/reviews/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Delete failed')
        return false
      }
      reviews.set(reviews().filter(r => r.id !== id))
      total.set(Math.max(0, total() - 1))
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  return {
    reviews,
    total,
    totalPages,
    loading,
    statusFilter,
    query,
    page,
    perPage,
    actionError,
    fetchReviews,
    setStatusFilter,
    setSearch,
    setPage,
    setReviewStatus,
    deleteReview,
  }
})
