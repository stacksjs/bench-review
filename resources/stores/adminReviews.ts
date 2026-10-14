import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export type ReviewStatusFilter = 'all' | 'pending' | 'published' | 'rejected' | 'removed'

export interface AdminReviewRow {
  id: number
  title: string
  content: string
  rating: number
  status: 'pending' | 'published' | 'rejected' | 'removed'
  type?: string | null
  likes?: number | null
  comments?: number | null
  created_at?: string | null
  updated_at?: string | null
  judge: { id: number | null, name: string }
  user: { id: number, name: string, email: string } | null
  // Judge right-of-reply: the official response body, or null if none.
  response?: string | null
  /**
   * Attached photos, thumbnails first. Present so a moderator can see what
   * they are approving — images are the highest-risk content this site takes
   * and the queue used to render none of them (bench-review#51).
   */
  photos?: Array<{ id: number, thumb_url: string | null, full_url: string | null }>
  /**
   * Open reports against this review. Surfaced on the row because the
   * decision is made here, not on the flags page — a moderator should not
   * have to know to go and look before publishing something that has been
   * reported (bench-review#51).
   */
  open_flags?: number
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
  /**
   * Ids ticked for a bulk action. Page-scoped: `fetchReviews` clears it, so
   * a selection can never outlive the rows it was made against and a
   * moderator cannot publish something that scrolled off a page they are no
   * longer looking at (bench-review#51).
   */
  const selectedIds = state<number[]>([])
  const bulkRunning = state<boolean>(false)

  const totalPages = derived<number>(() => Math.max(1, Math.ceil(total() / perPage())))

  let searchTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchReviews(): Promise<void> {
    loading.set(true)
    selectedIds.set([])
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

  function toggleSelected(id: number): void {
    const current = selectedIds()
    selectedIds.set(current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  /** Tick every row on the current page, or clear them all if already ticked. */
  function toggleSelectAll(): void {
    const visible = reviews().map(r => r.id)
    const allTicked = visible.length > 0 && visible.every(id => selectedIds().includes(id))
    selectedIds.set(allTicked ? [] : visible)
  }

  function clearSelection(): void {
    selectedIds.set([])
  }

  /**
   * Moderate every selected row in one request.
   *
   * Refetches rather than reconciling the list in place. The single-row
   * version can reason about one row's new status; a batch comes back split
   * across updated / unchanged / failed, and guessing which of those still
   * belong under the current filter is exactly the kind of arithmetic that
   * leaves a queue showing rows that are no longer in it. The moderator
   * wants to see the real queue depth after a batch anyway.
   */
  async function bulkSetStatus(status: 'published' | 'rejected'): Promise<boolean> {
    const ids = selectedIds()
    if (ids.length === 0 || bulkRunning())
      return false
    bulkRunning.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/admin/reviews/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        error?: string
        updated?: number[]
        failed?: Array<{ id: number, error: string }>
      }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Bulk update failed')
        return false
      }
      const failed = data.failed ?? []
      await fetchReviews()
      // A partial result is reported, not swallowed: silence here would mean
      // a moderator believing they had cleared the queue.
      //
      // Set AFTER the refetch, not before. fetchReviews() clears actionError
      // on success, so the obvious order — report, then refresh — wiped the
      // message before it could be painted. Measured: the harness returned
      // one failed row of three and the page showed nothing at all.
      if (failed.length > 0)
        actionError.set(`${failed.length} of ${ids.length} could not be updated (ids ${failed.map(f => f.id).join(', ')}).`)
      return failed.length === 0
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
    finally {
      bulkRunning.set(false)
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

  // Judge right-of-reply: post/replace the judge's official response to a
  // review (admin-mediated). Updates the row's `response` in place so the
  // composer reflects the saved text without a refetch.
  async function postResponse(id: number, body: string): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/reviews/${id}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string, body?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Could not save the response')
        return false
      }
      reviews.set(reviews().map(r => r.id === id ? { ...r, response: data.body ?? body } : r))
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  async function deleteResponse(id: number): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/reviews/${id}/response`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Could not remove the response')
        return false
      }
      reviews.set(reviews().map(r => r.id === id ? { ...r, response: null } : r))
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
    selectedIds,
    bulkRunning,
    fetchReviews,
    setStatusFilter,
    setSearch,
    setPage,
    setReviewStatus,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
    bulkSetStatus,
    deleteReview,
    postResponse,
    deleteResponse,
  }
})
