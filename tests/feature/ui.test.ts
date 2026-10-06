import { afterAll, beforeAll, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * DOM-dependent tests.
 *
 * The DOM is registered HERE rather than in `tests/setup.ts`, because
 * `GlobalRegistrator.register()` swaps `Request`/`Response`/`Headers` for
 * happy-dom's browser implementations, and a browser `Headers` silently drops
 * `Set-Cookie` and `Cookie` (the Fetch spec calls them forbidden header names).
 * Registering it globally therefore made `tests/unit/session-cookie.test.ts`
 * unable to see the `HttpOnly` session cookie it exists to assert. See
 * `tests/setup.ts` for the measurement.
 *
 * Bun runs test files in one process, so the registration is bracketed: any
 * file that needs a DOM takes it for its own duration and hands the native
 * globals back afterwards, instead of mutating the whole run.
 */

beforeAll(() => {
  GlobalRegistrator.register()
})

afterAll(async () => {
  await GlobalRegistrator.unregister()
})

test('dom test', () => {
  document.body.innerHTML = `<button>My button</button>`
  const button = document.querySelector('button')
  expect(button?.textContent).toEqual('My button')
})
