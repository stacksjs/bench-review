import process from 'node:process'
import { setupTestEnvironment } from '@stacksjs/testing'
import { buildTestDatabase, TEST_DB_PATH } from './helpers/database'

/**
 * Test Setup
 *
 * A place to register logic that should run before the tests run.
 * e.g. you may abstract your module mocks here, if you want
 * to prevent the original module from being evaluated.
 *
 * ## Why the DOM is NOT registered here
 *
 * `bun test` has no `document`, and `setupTestEnvironment()` does not add one
 * (`@stacksjs/testing` depends only on `@stacksjs/auth` and
 * `@stacksjs/ts-cloud`). happy-dom supplies it — but registering it *globally*
 * from this preload breaks server-side tests, so it is done per-file instead.
 *
 * `GlobalRegistrator.register()` swaps `Request`, `Response` and `Headers` for
 * happy-dom's BROWSER implementations, and the Fetch spec classes `Set-Cookie`
 * and `Cookie` as forbidden header names — so a browser `Headers` silently
 * drops them. Measured directly:
 *
 *     new Response('x', { headers: { 'Set-Cookie': 'a=b; HttpOnly' } })
 *       .headers.get('set-cookie')
 *     // happy-dom registered -> null
 *     // after unregister()   -> "a=b; HttpOnly"
 *
 * With a global DOM, `tests/unit/session-cookie.test.ts` — which exists
 * precisely to prove the session cookie carries `HttpOnly` — could not observe
 * a single `Set-Cookie` header, and three of its assertions failed against code
 * that was working correctly. A test environment that silently hides the
 * security property under test is worse than one with no DOM at all.
 *
 * So: a test that needs a DOM registers it itself and tears it down after. See
 * `tests/feature/ui.test.ts` for the pattern.
 */

/**
 * Redirect every database read and write to a scratch file BEFORE anything
 * imports the db layer.
 *
 * Without this the suite talks to `database/stacks.sqlite` — the developer's
 * working copy, holding the real 2,740-judge import. A test that writes there
 * destroys local state and makes its own result depend on whatever was
 * already in the table. Measured with a probe test: no override, 2,740
 * judges.
 *
 * This is a preload, so it runs before any test file's imports are
 * evaluated, which is the only point at which setting DB_DATABASE still
 * takes effect.
 */
process.env.DB_CONNECTION = 'sqlite'
process.env.DB_DATABASE = buildTestDatabase(TEST_DB_PATH)

setupTestEnvironment()
