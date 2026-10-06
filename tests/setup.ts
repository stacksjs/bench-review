import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { setupTestEnvironment } from '@stacksjs/testing'

/**
 * Test Setup
 *
 * A place to register logic that should run before the tests run.
 * e.g. you may abstract your module mocks here, if you want
 * to prevent the original module from being evaluated.
 *
 * ## Why happy-dom is registered here
 *
 * `bun test` runs in a plain server runtime with no `document`, and
 * `setupTestEnvironment()` does not add one — `@stacksjs/testing` depends only
 * on `@stacksjs/auth` and `@stacksjs/ts-cloud`, and calling it leaves
 * `globalThis.document` undefined. So `tests/feature/ui.test.ts`, which came
 * with the project scaffold and touches `document.body`, failed with
 * `ReferenceError: document is not defined` from the first commit onward. The
 * `test` job has been red on `main` ever since, which also meant it could not
 * report a real regression.
 *
 * `GlobalRegistrator.register()` installs happy-dom's `window`/`document` onto
 * the global scope — the pattern Bun documents for DOM testing — so a test that
 * needs a DOM has one, and the suite stops being decorative.
 *
 * Registered BEFORE `setupTestEnvironment()` deliberately: anything the
 * framework's setup does that sniffs for a browser-ish global should see the
 * DOM already in place rather than racing it.
 *
 * Note this makes every test file DOM-ish. That is fine for this project (the
 * only non-DOM concerns here are pure functions and `Response` objects, neither
 * of which care), but if a test ever needs to assert genuinely server-only
 * behaviour, move that file out from under this preload rather than
 * conditionally unregistering — partial teardown of a registered global DOM is
 * its own source of cross-test bleed.
 */

GlobalRegistrator.register()

setupTestEnvironment()
