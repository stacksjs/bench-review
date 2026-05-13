import type { CourtHouse, Judge } from '~/resources/types'
import { defineStore, derived, state, useStore } from '@stacksjs/stx'

defineStore('judges', () => {
  const judges = state<Judge[]>([])
  const courtHouses = state<CourtHouse[]>([])
  const loading = state<boolean>(false)

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
      const res = await fetch('/api/judges')
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
      const res = await fetch('/api/court-houses')
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

  return {
    judges,
    courtHouses,
    loading,
    setJudges,
    setCourtHouses,
    filteredJudges,
    filteredCourtHouses,
    totalResults,
    fetchJudges,
    fetchCourtHouses,
  }
})
