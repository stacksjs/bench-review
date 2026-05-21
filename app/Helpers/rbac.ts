import { createBqbRbacStore, setRbacStore } from '@stacksjs/auth'

// The framework's RBAC layer is store-agnostic — `rbac.ts` exposes a
// `setRbacStore()` hook that callers must invoke before any role lookup
// works. There's no auto-bootstrap, so the first call to `hasAnyRole` /
// `assignRole` from a cold module would otherwise throw
// "RBAC store not configured."
//
// The seeders and the admin middleware both need this wired before
// they touch roles. Importing a single helper keeps the configuration
// in one place and makes it obvious which database adapter the project
// uses (the bqb store backed by `@stacksjs/database`).
let booted = false

export function bootRbac(): void {
  if (booted) return
  booted = true
  setRbacStore(createBqbRbacStore())
}
