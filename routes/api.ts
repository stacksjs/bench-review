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
  .middleware('throttle:10,1m') // brute-force guard: 10 attempts/min/IP

route.post('/auth/register', 'Actions/Auth/RegisterAction')
  .name('bench.auth.register')
  .skipCsrf()
  .middleware('throttle:5,10m') // bot-signup guard: 5 registrations/10min/IP

route.post('/auth/logout', 'Actions/Auth/LogoutAction')
  .name('bench.auth.logout')
  .skipCsrf()

// Password reset. Both endpoints are intentionally unauthenticated —
// you can't have an active session if you've forgotten your password.
// Same skipCsrf rationale as login/register.
route.post('/auth/password/forgot', 'Actions/Password/SendPasswordResetEmailAction')
  .name('bench.password.email')
  .skipCsrf()
  .middleware('throttle:3,10m') // email-bomb guard: 3 reset emails/10min/IP

route.post('/auth/password/reset', 'Actions/Password/PasswordResetAction')
  .name('bench.password.reset')
  .skipCsrf()
  .middleware('throttle:5,10m')

// Email verification. `verify-email` is unauthenticated — the HMAC token
// from the emailed link is the proof, and the link is often opened in a
// fresh browser with no session. `resend` is auth-gated so it can only
// re-mail the signed-in user (no arbitrary-inbox spam). Both throttled.
route.post('/auth/verify-email', 'Actions/Auth/VerifyEmailAction')
  .name('bench.auth.verify-email')
  .skipCsrf()
  .middleware('throttle:10,10m')

route.post('/auth/resend-verification', 'Actions/Auth/ResendVerificationAction')
  .name('bench.auth.resend-verification')
  .middleware('auth')
  .skipCsrf()
  .middleware('throttle:3,10m') // email-bomb guard on resend

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
  .middleware('viewable-review')

route.get('/judges/{id}/reviews', 'Actions/Reviews/ReviewsByJudgeAction')
  .name('bench.judges.reviews')

// Judge recent rulings (bench-review#39). Public read; admin-only
// write. Until an automated CourtListener / PACER / state-docket
// pipeline lands, the cache is curated by moderators via the admin
// create endpoint. The render surface is provider-agnostic so
// switching to automated population is one helper file.
route.get('/judges/{id}/opinions', 'Actions/Judges/JudgeOpinionsAction')
  .name('bench.judges.opinions')

route.post('/admin/judges/{id}/opinions', 'Actions/Admin/Opinions/CreateJudgeOpinionAction')
  .name('bench.admin.judges.opinions.create')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

route.post('/reviews', 'Actions/Reviews/SubmitReviewAction')
  .name('bench.reviews.submit')
  .middleware('auth')
  .middleware('throttle:10,10m') // review-spam guard
  .skipCsrf()

// Review photos (bench-review#31). Author-only upload + delete.
// Upload runs every image through sharp's EXIF strip + a 3-size
// resize ladder; on-disk variants live under storage/uploads/.
// See app/Helpers/reviewPhotos.ts for the pipeline.
route.post('/reviews/{id}/photos', 'Actions/Reviews/UploadReviewPhotosAction')
  .name('bench.reviews.photos.upload')
  .middleware('auth')
  .skipCsrf()

route.delete('/me/photos/{id}', 'Actions/Me/DeleteMyReviewPhotoAction')
  .name('bench.me.photos.destroy')
  .middleware('auth')
  .skipCsrf()

// Comments under reviews (bench-review#44). Auto-published; admin
// can take a specific comment down via status='rejected'. Submit is
// auth-gated; reads are public (only published comments leak).
route.get('/reviews/{id}/comments', 'Actions/Reviews/CommentsForReviewAction')
  .name('bench.reviews.comments.index')

route.post('/reviews/{id}/comments', 'Actions/Reviews/CommentSubmitAction')
  .name('bench.reviews.comments.submit')
  .middleware('auth')
  .middleware('throttle:20,5m') // comment-spam guard
  .skipCsrf()

route.delete('/me/comments/{id}', 'Actions/Me/DeleteMyCommentAction')
  .name('bench.me.comments.destroy')
  .middleware('auth')
  .skipCsrf()

// Community report/flag on a review. Anonymous flagging is allowed
// — the trust model needs friction-free reporting. Signed-in flags
// are idempotent on (review_id, user_id). See FlagReviewAction for
// the rate-limit / abuse notes. Resolves bench-review#27.
route.post('/reviews/{id}/flag', 'Actions/Reviews/FlagReviewAction')
  .name('bench.reviews.flag')
  .middleware('throttle:10,10m') // anonymous flagging → IP-throttle abuse guard
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

// Self-declared credential claim (bench-review#37). User submits
// their role + state; admin verifies out-of-band and approves via
// the admin endpoints below. See app/Actions/Me/UpdateCredentialClaimAction.ts.
route.patch('/me/credentials', 'Actions/Me/UpdateCredentialClaimAction')
  .name('bench.me.credentials.update')
  .middleware('auth')
  .skipCsrf()

// Judge self-serve: claim a judge profile (the /judge/signup flow). Rides
// the credential rails — lands in the admin verification queue. Verified
// judges can then respond to reviews of their profile.
route.post('/me/judge-claim', 'Actions/Me/ClaimJudgeProfileAction')
  .name('bench.me.judge-claim')
  .middleware('auth')
  .middleware('throttle:5,10m')
  .skipCsrf()

// Verified judge posts their official response to a review of them.
// The action enforces the verified-judge gate (claimed_judge_id === the
// review's judge_id); the admin-mediated path still lives under /admin.
route.post('/me/reviews/{id}/response', 'Actions/Me/SubmitJudgeResponseAction')
  .name('bench.me.reviews.response')
  .middleware('auth')
  .middleware('throttle:20,10m')
  .skipCsrf()

// Admin credential review queue + approve/reject endpoint.
route.get('/admin/credentials', 'Actions/Admin/Credentials/CredentialQueueIndexAction')
  .name('bench.admin.credentials.index')
  .middleware('auth')
  .middleware('admin')

route.post('/admin/credentials/{id}/verify', 'Actions/Admin/Credentials/VerifyCredentialAction')
  .name('bench.admin.credentials.verify')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

// Moderation audit trail — read-only record of who moderated what.
route.get('/admin/moderation-log', 'Actions/Admin/ModerationLogIndexAction')
  .name('bench.admin.moderation-log')
  .middleware('auth')
  .middleware('admin')

// Authenticated password change. Settings form (SettingsView.stx)
// posts here; the action verifies the current password against the
// stored bcrypt hash before updating. See app/Actions/Me/ChangePasswordAction.ts
// for the security notes (no enumeration leak, no surprise token revoke).
route.patch('/me/password', 'Actions/Me/ChangePasswordAction')
  .name('bench.me.password.change')
  .middleware('auth')
  .skipCsrf()

// "Sign out everywhere" — revokes every session for the user, including
// the current one. Throttled: it's a deliberate, infrequent action.
route.post('/me/logout-all', 'Actions/Me/LogoutEverywhereAction')
  .name('bench.me.logout-all')
  .middleware('auth')
  .middleware('throttle:10,1h')
  .skipCsrf()

// Privacy / data rights: export everything we hold about the user, and
// permanent self-serve account deletion (password-confirmed, full cascade).
route.get('/me/export', 'Actions/Me/ExportDataAction')
  .name('bench.me.export')
  .middleware('auth')
route.delete('/me', 'Actions/Me/DeleteAccountAction')
  .name('bench.me.delete')
  .middleware('auth')
  .middleware('throttle:5,1h')
  .skipCsrf()

// Server-side compose-draft autosave (bench-review#26). One action
// handles GET / PUT / DELETE — one draft per user, enforced by the
// unique index on review_drafts.user_id. The editor's existing
// localStorage cache stays as the per-tab fast path; this endpoint
// is the cross-device source of truth.
route.get('/me/draft', 'Actions/Me/DraftAction')
  .name('bench.me.draft.get')
  .middleware('auth')
route.put('/me/draft', 'Actions/Me/DraftAction')
  .name('bench.me.draft.put')
  .middleware('auth')
  .skipCsrf()
route.delete('/me/draft', 'Actions/Me/DraftAction')
  .name('bench.me.draft.destroy')
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
  .middleware('throttle:5,1m') // admin brute-force guard: tighter than public login

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

// Judge right-of-reply. Admin posts/retracts the judge's official response
// to a review on the judge's behalf (judges have no accounts yet). The
// response renders publicly under the review via ShowReviewAction.
route.post('/admin/reviews/{id}/response', 'Actions/Admin/Reviews/CreateReviewResponseAction')
  .name('bench.admin.reviews.response.create')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()

route.delete('/admin/reviews/{id}/response', 'Actions/Admin/Reviews/DeleteReviewResponseAction')
  .name('bench.admin.reviews.response.destroy')
  .middleware('auth')
  .middleware('admin')
  .skipCsrf()
