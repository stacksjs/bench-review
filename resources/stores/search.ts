import { defineStore, state } from '@stacksjs/stx'

type SearchTab = 'all' | 'judges' | 'courts'

defineStore('search', () => {
  const query = state<string>('')
  const location = state<string>('')
  const tab = state<SearchTab>('all')
  const loading = state<boolean>(false)

  function setQuery(q: string): void {
    query.set(q)
  }

  function setLocation(loc: string): void {
    location.set(loc)
  }

  function setTab(t: SearchTab): void {
    tab.set(t)
  }

  function navigateToSearch(): void {
    const params = new URLSearchParams()
    if (query()) params.set('q', query())
    if (location()) params.set('location', location())
    navigate('/search?', true) + params.toString()
  }

  function initFromUrl(): void {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q') || ''
    const t = (params.get('type') || 'all') as SearchTab
    query.set(q)
    tab.set(t)
  }

  function updateUrlQuery(): void {
    const params = new URLSearchParams(window.location.search)
    params.set('q', query())
    window.history.replaceState({}, '', `?${params.toString()}`)
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
