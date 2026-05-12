import { response, route } from '@stacksjs/router'

/**
 * This file is the entry point for your application's API routes.
 * The routes defined here are automatically registered. Last but
 * not least, you may also create any other `routes/*.ts` files.
 *
 * Framework routes (auth, dashboard, commerce, CMS, etc.) are loaded
 * automatically from storage/framework/defaults/routes/dashboard.ts.
 * You do NOT need to define them here — only add your own custom routes.
 *
 * @see https://docs.stacksjs.com/routing
 */

// Your custom routes go here:
route.get('/', () => response.text('hello'))
route.get('/coming-soon', 'Controllers/ComingSoonController@index')

// Newsletter signup. The framework's defaults/routes/dashboard.ts also
// declares this route, but a user route wins — keeping it here makes the
// endpoint visible in app code and lets us swap to a bench-review-specific
// `app/Actions/SubscriberEmailAction.ts` later without touching framework
// defaults. For now `Actions/SubscriberEmailAction` resolves via the
// `app/` → `storage/framework/defaults/app/` fallback to the framework's
// implementation, which writes both `subscribers` and `subscriber_emails`.
route.post('/subscribe', 'Actions/SubscriberEmailAction')
  .name('bench.email.subscribe')
  .skipCsrf()

// Auth — login / register / logout. Framework defaults register these
// without `.skipCsrf()`, which means a JSON fetch from a logged-out
// page (no session, no CSRF token) gets a 403 "CSRF token mismatch".
// User routes win over framework defaults, so re-declaring with
// skipCsrf is the smallest change that lets the SPA-style auth views
// (resources/views/{login,register}.stx) work without us building a
// CSRF-token-fetch dance into every form. The action handlers
// themselves still hash passwords + issue session tokens; CSRF
// protection at the API layer doesn't add anything for unauthenticated
// endpoints driven from same-origin fetch.
route.post('/login', 'Actions/Auth/LoginAction')
  .name('bench.auth.login')
  .skipCsrf()

route.post('/register', 'Actions/Auth/RegisterAction')
  .name('bench.auth.register')
  .skipCsrf()

route.post('/logout', 'Actions/Auth/LogoutAction')
  .name('bench.auth.logout')
  .skipCsrf()

// Password reset. Both endpoints are intentionally unauthenticated —
// you can't have an active session if you've forgotten your password.
// Same skipCsrf rationale as login/register.
route.post('/password/send-password-reset-email', 'Actions/Password/SendPasswordResetEmailAction')
  .name('bench.password.email')
  .skipCsrf()

route.post('/password/reset', 'Actions/Password/PasswordResetAction')
  .name('bench.password.reset')
  .skipCsrf()
