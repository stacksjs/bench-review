import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export type JudgeStatusFilter = 'all' | 'active' | 'retired' | 'deceased'

export interface AdminJudgeRow {
  id: number
  name: string
  slug: string | null
  status: string
  jurisdiction: string | null
  state: string | null
  practice_area: string | null
  appointed_year: number | null
  external_id: string | null
  image_url: string | null
  court_house_id: number | null
  court_house: { id: number, name: string } | null
  review_count: number
}

export interface JudgeDraft {
  name: string
  status: string
  jurisdiction: string
  state: string
  practice_area: string
  appointed_year: string
  bio: string
  court_house_id: string
}

/**
 * Admin judge directory (bench-review#50). Reads GET /api/admin/judges and
 * writes through the auth-gated save/merge actions — the auto-CRUD
 * POST /api/judges this replaces had no authentication at all.
 */
defineStore('adminJudges', () => {
  const judges = state<AdminJudgeRow[]>([])
  const total = state<number>(0)
  const loading = state<boolean>(false)
  const query = state<string>('')
  const statusFilter = state<JudgeStatusFilter>('all')
  const page = state<number>(1)
  const perPage = state<number>(25)
  const actionError = state<string>('')
  /** Review ids a blocked merge named, so the admin can go and resolve them. */
  const mergeConflicts = state<Array<Record<string, any>>>([])

  const totalPages = derived<number>(() => Math.max(1, Math.ceil(total() / perPage())))

  let searchTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchJudges(): Promise<void> {
    loading.set(true)
    try {
      const params = new URLSearchParams({
        status: statusFilter(),
        page: String(page()),
        perPage: String(perPage()),
      })
      const q = query().trim()
      if (q) params.set('q', q)
      const res = await useStore('auth').authFetch(`/api/admin/judges?${params.toString()}`)
      if (!res.ok) {
        actionError.set(`Failed to load judges (${res.status})`)
        return
      }
      const data = await res.json() as { judges: AdminJudgeRow[], total: number }
      judges.set(Array.isArray(data.judges) ? data.judges : [])
      total.set(Number(data.total ?? 0))
      actionError.set('')
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
    }
    finally {
      loading.set(false)
    }
  }

  function setSearch(next: string): void {
    query.set(next)
    page.set(1)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { fetchJudges() }, 250)
  }

  function setStatusFilter(next: JudgeStatusFilter): void {
    statusFilter.set(next)
    page.set(1)
    fetchJudges()
  }

  function setPage(next: number): void {
    page.set(Math.max(1, next))
    fetchJudges()
  }

  /** Create when `id` is 0, edit otherwise. Mirrors SaveJudgeAction. */
  async function saveJudge(id: number, draft: JudgeDraft): Promise<boolean> {
    try {
      const path = id > 0 ? `/api/admin/judges/${id}` : '/api/admin/judges'
      const res = await useStore('auth').authFetch(path, {
        method: id > 0 ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          status: draft.status,
          jurisdiction: draft.jurisdiction,
          state: draft.state,
          practice_area: draft.practice_area,
          appointed_year: draft.appointed_year,
          bio: draft.bio,
          court_house_id: draft.court_house_id,
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Could not save the judge')
        return false
      }
      actionError.set('')
      await fetchJudges()
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  /**
   * Fold `sourceId` into `targetId`.
   *
   * A 409 carries the rows that blocked it; those are kept so the admin can
   * act on them instead of being told only that it did not work.
   */
  async function mergeJudges(targetId: number, sourceId: number): Promise<boolean> {
    mergeConflicts.set([])
    try {
      const res = await useStore('auth').authFetch(`/api/admin/judges/${targetId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string, conflicts?: Array<Record<string, any>> }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Could not merge these profiles')
        mergeConflicts.set(Array.isArray(data.conflicts) ? data.conflicts : [])
        return false
      }
      actionError.set('')
      await fetchJudges()
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  return {
    judges,
    total,
    totalPages,
    loading,
    query,
    statusFilter,
    page,
    perPage,
    actionError,
    mergeConflicts,
    fetchJudges,
    setSearch,
    setStatusFilter,
    setPage,
    saveJudge,
    mergeJudges,
  }
})
