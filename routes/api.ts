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
 * NOTE: paths in this file are AUTO-PREFIXED with `/api` by the
 * framework (stacksjs/stacks#1835). Declare bare paths here
 * (e.g. `/judges`) and they'll be served at `/api/judges`. Don't
 * write `/api/judges` — that ends up as `/api/api/judges`.
 *
 * @see https://docs.stacksjs.com/routing
 */

// Your custom routes go here:
route.get('/', () => response.text('hello'))
route.get('/coming-soon', 'Controllers/ComingSoonController@index')

// Public reviewer profile (bench-review#29). Public-safe payload —
// no email, no PII. Aggregates over published reviews only.
route.get('/users/{id}', 'Actions/Users/UserShowAction')
  .name('bench.users.show')

route.get('/users/{id}/reviews', 'Actions/Users/UserReviewsAction')
  .name('bench.users.reviews')

// Home page activity slices — trending judges, top-rated judges,
// active reviewers in one round-trip. See HomeHighlightsAction for the
// per-section query details. Resolves bench-review#34.
route.get('/home/highlights', 'Actions/HomeHighlightsAction')
  .name('bench.home.highlights')

// SEO surface. Sitemap lives under /api/ since this file auto-prefixes,
// but robots.txt is a static file in public/ that points at the full
// URL so search engines find it the standard way. See public/robots.txt
// + app/Actions/SitemapAction.ts.
route.get('/sitemap.xml', 'Actions/SitemapAction')
  .name('bench.sitemap')

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
route.post('/auth/login', 'Actions/Auth/LoginAction')
  .name('bench.auth.login')
  .skipCsrf()

route.post('/auth/register', 'Actions/Auth/RegisterAction')
  .name('bench.auth.register')
  .skipCsrf()

route.post('/auth/logout', 'Actions/Auth/LogoutAction')
  .name('bench.auth.logout')
  .skipCsrf()

// Password reset. Both endpoints are intentionally unauthenticated —
// you can't have an active session if you've forgotten your password.
// Same skipCsrf rationale as login/register.
route.post('/auth/password/forgot', 'Actions/Password/SendPasswordResetEmailAction')
  .name('bench.password.email')
  .skipCsrf()

route.post('/auth/password/reset', 'Actions/Password/PasswordResetAction')
  .name('bench.password.reset')
  .skipCsrf()

// Judge + courthouse read endpoints. Public (no auth gate) because the
// directory pages are public surface area. Mutating routes will live
// under `/api/judges` (POST/PATCH/DELETE) when review submission lands
// — keep those guarded by `auth` middleware then.
route.get('/judges', 'Actions/Judges/JudgeIndexAction')
  .name('bench.judges.index')

// Server-side typeahead — drives the search input in the review form.
// MUST come BEFORE the `/api/judges/{id}/reviews` route below: bun-router
// matches paths in registration order and `/search` would otherwise be
// captured as `:id = 'search'`.
route.get('/judges/search', 'Actions/Judges/JudgeSearchAction')
  .name('bench.judges.search')

route.get('/court-houses', 'Actions/CourtHouses/CourtHouseIndexAction')
  .name('bench.courtHouses.index')

// Reviews — split into lazy reads + auth-gated writes.
// - GET /api/reviews                 : latest across all judges (home feed)
// - GET /api/judges/:id/reviews      : reviews for a single judge (detail page)
// - POST /api/reviews                : submit a new review (auth required)
//
// The reads stay public; the write is gated by the `auth` middleware
// auto-discovered from `resources/middleware/auth.ts`.
route.get('/reviews', 'Actions/Reviews/LatestReviewsAction')
  .name('bench.reviews.latest')

route.get('/reviews/{id}', 'Actions/Reviews/ShowReviewAction')
  .name('bench.reviews.show')

route.get('/judges/{id}/reviews', 'Actions/Reviews/ReviewsByJudgeAction')
  .name('bench.judges.reviews')

route.post('/reviews', 'Actions/Reviews/SubmitReviewAction')
  .name('bench.reviews.submit')
  .middleware('auth')
  .skipCsrf()

// Community report/flag on a review. Anonymous flagging is allowed
// — the trust model needs friction-free reporting. Signed-in flags
// are idempotent on (review_id, user_id). See FlagReviewAction for
// the rate-limit / abuse notes. Resolves bench-review#27.
route.post('/reviews/{id}/flag', 'Actions/Reviews/FlagReviewAction')
  .name('bench.reviews.flag')
  .skipCsrf()

// Toggle "people find this helpful" on a review. POST is idempotent on
// (user_id, judge_review_id): an existing like is removed, a missing
// one is created. The action keeps the denormalised `likes` counter
// on the review row in sync so public feed reads stay COUNT-free.
route.post('/reviews/{id}/like', 'Actions/Reviews/LikeReviewAction')
  .name('bench.reviews.like')
  .middleware('auth')
  .skipCsrf()

// Self-routes — return data scoped to the authenticated user. Auth-
// gated; profile + follow pages depend on these.
route.get('/me', 'Actions/Me/MeAction')
  .name('bench.me')
  .middleware('auth')

route.get('/me/reviews', 'Actions/Me/MyReviewsAction')
  .name('bench.me.reviews')
  .middleware('auth')

route.patch('/me/reviews/{id}', 'Actions/Me/UpdateMyReviewAction')
  .name('bench.me.reviews.update')
  .middleware('auth')
  .skipCsrf()

route.delete('/me/reviews/{id}', 'Actions/Me/DeleteMyReviewAction')
  .name('bench.me.reviews.destroy')
  .middleware('auth')
  .skipCsrf()

// Authenticated password change. Settings form (SettingsView.stx)
// posts here; the action verifies the current password against the
// stored bcrypt hash before updating. See app/Actions/Me/ChangePasswordAction.ts
// for the security notes (no enumeration leak, no surprise token revoke).
route.patch('/me/password', 'Actions/Me/ChangePasswordAction')
  .name('bench.me.password.change')
  .middleware('auth')
  .skipCsrf()

// In-app notification feed for the bell icon + /notifications page.
route.get('/me/notifications', 'Actions/Me/NotificationsIndexAction')
  .name('bench.me.notifications.index')
  .middleware('auth')

route.post('/me/notifications/{id}/read', 'Actions/Me/NotificationReadAction')
  .name('bench.me.notifications.read')
  .middleware('auth')
  .skipCsrf()

route.post('/me/notifications/read-all', 'Actions/Me/NotificationsReadAllAction')
  .name('bench.me.notifications.read-all')
  .middleware('auth')
  .skipCsrf()

route.get('/me/follows', 'Actions/Me/MyFollowsAction')
  .name('bench.me.follows')
  .middleware('auth')

// Follow / unfollow a judge. POST is idempotent on (user_id, judge_id);
// DELETE on a row that doesn't exist is a no-op. Both auth-gated.
route.post('/judges/{id}/follow', 'Actions/Judges/FollowJudgeAction')
  .name('bench.judges.follow')
  .middleware('auth')
  .skipCsrf()

route.delete('/judges/{id}/follow', 'Actions/Judges/UnfollowJudgeAction')
  .name('bench.judges.unfollow')
  .middleware('auth')
  .skipCsrf()

// Admin — separate login endpoint. Verifies the user has the `admin`
// role AFTER credentials are validated; non-admins get a 403 and the
// freshly issued token is revoked before the response goes out so a
// bounced login never leaves a usable credential behind.
route.post('/admin/auth/login', 'Actions/Admin/Auth/AdminLoginAction')
  .name('bench.admin.auth.login')
  .skipCsrf()

// Admin user management — all auth + admin gated. `admin` middleware
// resolves the current user via Auth.user() and checks the role itself,
// so chaining `.middleware('auth').middleware('admin')` covers both
// the "is signed in" and "is admin" gates.
route.get('/admin/users', 'Actions/Admin/Users/UserIndexAction')
  .name('bench.admin.users.index')
  .middleware('auth')
  .middleware('admin')

route.patch('/admin/users/{id}', 'Actions/Admin/Users/UpdateUserAction')
  .name('bench.admin.users.update')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

route.post('/admin/users/{id}/role', 'Actions/Admin/Users/ToggleRoleAction')
  .name('bench.admin.users.role')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

route.delete('/admin/users/{id}', 'Actions/Admin/Users/DeleteUserAction')
  .name('bench.admin.users.destroy')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

// Admin review moderation.
route.get('/admin/reviews', 'Actions/Admin/Reviews/ReviewIndexAction')
  .name('bench.admin.reviews.index')
  .middleware('auth')
  .middleware('admin')

route.patch('/admin/reviews/{id}/status', 'Actions/Admin/Reviews/UpdateReviewStatusAction')
  .name('bench.admin.reviews.status')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

route.delete('/admin/reviews/{id}', 'Actions/Admin/Reviews/DeleteReviewAction')
  .name('bench.admin.reviews.destroy')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()
