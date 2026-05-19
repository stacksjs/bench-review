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
route.post('/api/subscribe', 'Actions/SubscriberEmailAction')
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
route.post('/api/auth/login', 'Actions/Auth/LoginAction')
  .name('bench.auth.login')
  .skipCsrf()

route.post('/api/auth/register', 'Actions/Auth/RegisterAction')
  .name('bench.auth.register')
  .skipCsrf()

route.post('/api/auth/logout', 'Actions/Auth/LogoutAction')
  .name('bench.auth.logout')
  .skipCsrf()

// Password reset. Both endpoints are intentionally unauthenticated —
// you can't have an active session if you've forgotten your password.
// Same skipCsrf rationale as login/register.
route.post('/api/auth/password/forgot', 'Actions/Password/SendPasswordResetEmailAction')
  .name('bench.password.email')
  .skipCsrf()

route.post('/api/auth/password/reset', 'Actions/Password/PasswordResetAction')
  .name('bench.password.reset')
  .skipCsrf()

// Judge + courthouse read endpoints. Public (no auth gate) because the
// directory pages are public surface area. Mutating routes will live
// under `/api/judges` (POST/PATCH/DELETE) when review submission lands
// — keep those guarded by `auth` middleware then.
route.get('/api/judges', 'Actions/Judges/JudgeIndexAction')
  .name('bench.judges.index')

// Server-side typeahead — drives the search input in the review form.
// MUST come BEFORE the `/api/judges/{id}/reviews` route below: bun-router
// matches paths in registration order and `/search` would otherwise be
// captured as `:id = 'search'`.
route.get('/api/judges/search', 'Actions/Judges/JudgeSearchAction')
  .name('bench.judges.search')

route.get('/api/court-houses', 'Actions/CourtHouses/CourtHouseIndexAction')
  .name('bench.courtHouses.index')

// Reviews — split into lazy reads + auth-gated writes.
// - GET /api/reviews                 : latest across all judges (home feed)
// - GET /api/judges/:id/reviews      : reviews for a single judge (detail page)
// - POST /api/reviews                : submit a new review (auth required)
//
// The reads stay public; the write is gated by the `auth` middleware
// auto-discovered from `resources/middleware/auth.ts`.
route.get('/api/reviews', 'Actions/Reviews/LatestReviewsAction')
  .name('bench.reviews.latest')

route.get('/api/reviews/{id}', 'Actions/Reviews/ShowReviewAction')
  .name('bench.reviews.show')

route.get('/api/judges/{id}/reviews', 'Actions/Reviews/ReviewsByJudgeAction')
  .name('bench.judges.reviews')

route.post('/api/reviews', 'Actions/Reviews/SubmitReviewAction')
  .name('bench.reviews.submit')
  .middleware('auth')
  .skipCsrf()

// Self-routes — return data scoped to the authenticated user. Auth-
// gated; profile + follow pages depend on these.
route.get('/api/me/reviews', 'Actions/Me/MyReviewsAction')
  .name('bench.me.reviews')
  .middleware('auth')

route.get('/api/me/follows', 'Actions/Me/MyFollowsAction')
  .name('bench.me.follows')
  .middleware('auth')

// Follow / unfollow a judge. POST is idempotent on (user_id, judge_id);
// DELETE on a row that doesn't exist is a no-op. Both auth-gated.
route.post('/api/judges/{id}/follow', 'Actions/Judges/FollowJudgeAction')
  .name('bench.judges.follow')
  .middleware('auth')
  .skipCsrf()

route.delete('/api/judges/{id}/follow', 'Actions/Judges/UnfollowJudgeAction')
  .name('bench.judges.unfollow')
  .middleware('auth')
  .skipCsrf()
