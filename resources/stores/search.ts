import { defineStore, state } from '@stacksjs/stx'

defineStore('search', () => {
  const query = state('')
  const location = state('')
  const tab = state('all')
  const loading = state(false)

  function setQuery(q) {
    query.set(q)
  }

  function setLocation(loc) {
    location.set(loc)
  }

  function setTab(t) {
    tab.set(t)
  }

  function navigateToSearch() {
    const params = new URLSearchParams()
    if (query()) params.set('q', query())
    if (location()) params.set('location', location())
    navigate('/search?', true) + params.toString()
  }

  function initFromUrl() {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q') || ''
    const t = params.get('type') || 'all'
    query.set(q)
    tab.set(t)
  }

  function updateUrlQuery() {
    const params = new URLSearchParams(window.location.search)
    params.set('q', query())
    window.history.replaceState({}, '', '?' + params.toString())
  }

  return {
    query,
    location,
    tab,
    loading,
    setQuery,
    setLocation,
    setTab,
    navigateToSearch,
    initFromUrl,
    updateUrlQuery,
  }
})
