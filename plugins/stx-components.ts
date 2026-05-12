import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

/**
 * stx plugin shim that registers `@stacksjs/components`'s UI directory
 * as a discoverable component source. With this in place, stx resolves
 * `<Notification>`, `<Button>`, etc. by name from the installed package
 * instead of needing a local copy under `resources/components/`.
 *
 * The package itself doesn't ship a stx-plugin manifest (its `default`
 * export is just a re-export bundle, see
 * `node_modules/@stacksjs/components/src/index.ts`), so we provide the
 * minimum surface stx's plugin loader looks for: a `name` and a
 * `components` path. stx will resolve `components` against this file's
 * directory, so we hand over an absolute path computed from the
 * installed package — that way it keeps working regardless of how bun
 * decides to hoist the dependency.
 */

const require = createRequire(import.meta.url)
const pkgManifest = require.resolve('@stacksjs/components/package.json')
const pkgRoot = dirname(pkgManifest)

export default {
  name: 'stacksjs-components',
  // The SFCs live at `<pkg>/src/ui/<component>/<Component>.stx`. stx's
  // discovery scans recursively, so pointing at `src/ui` exposes every
  // component (Notification, Button, Dialog, …) by its tag name.
  components: resolve(pkgRoot, 'src/ui'),
}
