import { defineStore, derived, state, useStore } from '@stacksjs/stx'

export interface AdminUserRow {
  id: number
  email: string
  name: string
  created_at?: string | null
  updated_at?: string | null
  roles: Array<{ id: number, name: string, guard_name: string }>
}

defineStore('adminUsers', () => {
  const users = state<AdminUserRow[]>([])
  const total = state<number>(0)
  const loading = state<boolean>(false)
  const query = state<string>('')
  const page = state<number>(1)
  const perPage = state<number>(25)
  const actionError = state<string>('')

  const totalPages = derived<number>(() => Math.max(1, Math.ceil(total() / perPage())))

  let searchTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchUsers(): Promise<void> {
    loading.set(true)
    try {
      const params = new URLSearchParams({
        page: String(page()),
        perPage: String(perPage()),
      })
      const q = query().trim()
      if (q) params.set('q', q)
      const res = await useStore('auth').authFetch(`/api/admin/users?${params.toString()}`)
      if (!res.ok) {
        actionError.set(`Failed to load users (${res.status})`)
        return
      }
      const data = await res.json() as { users: AdminUserRow[], total: number }
      users.set(data.users)
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

  // Debounced search — same shape as judges.searchJudges. 250ms feels
  // right at typing speed without flooding the API.
  function setSearch(next: string): void {
    query.set(next)
    page.set(1)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { fetchUsers() }, 250)
  }

  function setPage(next: number): void {
    page.set(Math.max(1, next))
    fetchUsers()
  }

  async function updateUser(id: number, patch: { name?: string, email?: string }): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, user?: AdminUserRow, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Update failed')
        return false
      }
      // In-place patch so the UI updates without a full refetch.
      if (data.user) {
        users.set(users().map(u => u.id === id ? { ...u, ...data.user!, roles: u.roles } : u))
      }
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  async function toggleRole(id: number, role: string, action: 'assign' | 'remove'): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/users/${id}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, roles?: AdminUserRow['roles'], error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Role change failed')
        return false
      }
      users.set(users().map(u => u.id === id ? { ...u, roles: data.roles ?? u.roles } : u))
      actionError.set('')
      return true
    }
    catch (err) {
      actionError.set(err instanceof Error ? err.message : 'Network error')
      return false
    }
  }

  async function deleteUser(id: number): Promise<boolean> {
    try {
      const res = await useStore('auth').authFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({})) as { ok?: boolean, error?: string }
      if (!res.ok || !data.ok) {
        actionError.set(data.error || 'Delete failed')
        return false
      }
      users.set(users().filter(u => u.id !== id))
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
    users,
    total,
    totalPages,
    loading,
    query,
    page,
    perPage,
    actionError,
    fetchUsers,
    setSearch,
    setPage,
    updateUser,
    toggleRole,
    deleteUser,
  }
})
