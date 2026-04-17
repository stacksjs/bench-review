import { defineStore, useStore, state, derived } from '@stacksjs/stx'

defineStore('judges', () => {
  const judges = state([])
  const courtHouses = state([])
  const loading = state(false)

  function setJudges(data) {
    judges.set(data)
  }

  function setCourtHouses(data) {
    courtHouses.set(data)
  }

  const filteredJudges = derived(() => {
    const search = useStore('search')
    const q = search.query()
    const all = judges()
    if (!q) return all
    const needle = q.toLowerCase()
    return all.filter(j =>
      j.name.toLowerCase().includes(needle) ||
      j.court.name.toLowerCase().includes(needle) ||
      j.location.toLowerCase().includes(needle)
    )
  })

  const filteredCourtHouses = derived(() => {
    const search = useStore('search')
    const q = search.query()
    const all = courtHouses()
    if (!q) return all
    const needle = q.toLowerCase()
    return all.filter(c =>
      c.name.toLowerCase().includes(needle) ||
      c.city.toLowerCase().includes(needle) ||
      c.state.toLowerCase().includes(needle)
    )
  })

  const totalResults = derived(() => {
    return filteredJudges().length + filteredCourtHouses().length
  })

  async function fetchJudges() {
    loading.set(true)
    try {
      const res = await fetch('/api/judges')
      if (res.ok) {
        const data = await res.json()
        judges.set(data)
      }
    } catch (error) {
      console.error('Failed to fetch judges:', error)
    } finally {
      loading.set(false)
    }
  }

  async function fetchCourtHouses() {
    loading.set(true)
    try {
      const res = await fetch('/api/court-houses')
      if (res.ok) {
        const data = await res.json()
        courtHouses.set(data)
      }
    } catch (error) {
      console.error('Failed to fetch court houses:', error)
    } finally {
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
