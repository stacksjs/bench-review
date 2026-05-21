import type { CourtHouse, Judge } from '~/resources/types'
import { defineStore, derived, state, useStore } from '@stacksjs/stx'

defineStore('judges', () => {
  const judges = state<Judge[]>([])
  const courtHouses = state<CourtHouse[]>([])
  const loading = state<boolean>(false)

  // Typeahead results live in their own slice so the directory's
  // `judges` cache stays untouched while a user is mid-search. The
  // search-form (and any future autocomplete) reads `searchResults`;
  // the directory pages keep reading `judges`.
  const searchResults = state<Judge[]>([])
  const searchLoading = state<boolean>(false)
  const searchQuery = state<string>('')

  // Mutable scratch so the debounce + abort-on-stale logic can survive
  // re-renders without leaking React-style refs everywhere.
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let searchAbort: AbortController | null = null

  function setJudges(data: Judge[]): void {
    judges.set(data)
  }

  function setCourtHouses(data: CourtHouse[]): void {
    courtHouses.set(data)
  }

  const filteredJudges = derived<Judge[]>(() => {
    const search = useStore('search')
    const q = search.query()
    const all = judges()
    if (!q) return all
    const needle = q.toLowerCase()
    return all.filter(j =>
      j.name.toLowerCase().includes(needle)
      || j.court.name.toLowerCase().includes(needle)
      || j.location.toLowerCase().includes(needle),
    )
  })

  const filteredCourtHouses = derived<CourtHouse[]>(() => {
    const search = useStore('search')
    const q = search.query()
    const all = courtHouses()
    if (!q) return all
    const needle = q.toLowerCase()
    return all.filter(c =>
      c.name.toLowerCase().includes(needle)
      || c.city.toLowerCase().includes(needle)
      || c.state.toLowerCase().includes(needle),
    )
  })

  const totalResults = derived<number>(() => {
    return filteredJudges().length + filteredCourtHouses().length
  })

  async function fetchJudges(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/judges')
      if (res.ok) {
        const data = await res.json() as Judge[]
        judges.set(data)
      }
    }
    catch (error) {
      console.error('Failed to fetch judges:', error)
    }
    finally {
      loading.set(false)
    }
  }

  async function fetchCourtHouses(): Promise<void> {
    loading.set(true)
    try {
      const res = await useStore('auth').authFetch('/api/court-houses')
      if (res.ok) {
        const data = await res.json() as CourtHouse[]
        courtHouses.set(data)
      }
    }
    catch (error) {
      console.error('Failed to fetch court houses:', error)
    }
    finally {
      loading.set(false)
    }
  }

  /**
   * Debounced server-side search. Two safety nets baked in:
   *
   *  - **Debounce** (250ms): collapses bursts of keystrokes into one
   *    request. Tunable via the `delay` arg if a caller wants snappier
   *    or lazier feel.
   *  - **AbortController**: cancels the previous in-flight request so
   *    a slow response from query "Sm" can't overwrite the fresh
   *    response from query "Smith" if the user types faster than the
   *    network resolves.
   *
   * Empty/whitespace queries short-circuit to an empty array and
   * cancel any pending fetch — the SPA's empty state takes over.
   */
  function searchJudges(query: string, delay = 250): void {
    searchQuery.set(query)

    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }

    const trimmed = query.trim()
    if (trimmed.length === 0) {
      if (searchAbort) { searchAbort.abort(); searchAbort = null }
      searchResults.set([])
      searchLoading.set(false)
      return
    }

    searchTimer = setTimeout(async () => {
      // Cancel any in-flight request before kicking off a new one.
      if (searchAbort)
        searchAbort.abort()
      const controller = new AbortController()
      searchAbort = controller

      searchLoading.set(true)
      try {
        const res = await useStore('auth').authFetch(`/api/judges/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json() as Judge[]
        // Only write if this controller is still the active one —
        // belt-and-suspenders against the rare case where abort fires
        // AFTER the fetch resolves but BEFORE we get here.
        if (searchAbort === controller)
          searchResults.set(Array.isArray(data) ? data : [])
      }
      catch (err: any) {
        if (err?.name !== 'AbortError')
          console.error('[judges] searchJudges failed:', err)
      }
      finally {
        if (searchAbort === controller) {
          searchLoading.set(false)
          searchAbort = null
        }
      }
    }, delay)
  }

  return {
    judges,
    courtHouses,
    loading,
    searchResults,
    searchLoading,
    searchQuery,
    setJudges,
    setCourtHouses,
    filteredJudges,
    filteredCourtHouses,
    totalResults,
    fetchJudges,
    fetchCourtHouses,
    searchJudges,
  }
})
