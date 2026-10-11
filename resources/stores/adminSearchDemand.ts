import { defineStore, state, useStore } from '@stacksjs/stx'

export interface SearchDemandRow {
  id: number
  /** The normalised query, as searched. Carries no searcher — see app/Helpers/searchDemand.ts. */
  query: string
  /** How many times anyone has searched it. */
  searches: number
  /** Judges returned the last time it ran. Zero means nobody found anything. */
  last_result_count: number
  first_seen_at: string | null
  last_seen_at: string | null
}

/**
 * Judge-directory search demand, for the admin dashboard. Defaults to the
 * zero-result queries, which are the judge-import backlog: each row is
 * somebody who came looking for a judge bench does not have.
 *
 * Mirrors the adminFlags store shape. Kept separate from the other admin
 * stores because the dashboard pulls it on its own, and nothing else needs it.
 */
defineStore('adminSearchDemand', () => {
  const queries = state<SearchDemandRow[]>([])
  const loading = state<boolean>(false)
  const loadError = state<string>('')
  /** Distinct zero-result queries overall — the backlog size, not the page. */
  const missingTotal = state<number>(0)

  async function fetchDemand(limit = 10): Promise<void> {
    loading.set(true)
    loadError.set('')
    try {
      const res = await useStore('auth').authFetch(`/api/admin/search-demand?limit=${limit}`)
      if (!res.ok) {
        loadError.set(`Failed to load search demand (${res.status})`)
        return
      }
      const data = await res.json() as { queries?: SearchDemandRow[], missing_total?: number }
      queries.set(Array.isArray(data?.queries) ? data.queries : [])
      missingTotal.set(Number(data?.missing_total ?? 0))
    }
    catch (err) {
      console.error('[adminSearchDemand] fetchDemand failed:', err)
      loadError.set('Could not reach the server.')
    }
    finally {
      loading.set(false)
    }
  }

  return {
    queries,
    loading,
    loadError,
    missingTotal,
    fetchDemand,
  }
})
