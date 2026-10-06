# Deploying Bench Review

> **Host not yet chosen.** This document describes the artifact bench-review
> produces and the contract any host must satisfy to serve it. It does not
> describe a provisioned environment, because there isn't one yet. See
> [Outstanding before first deploy](#outstanding-before-first-deploy).

Production domain: **benchreview.org** (declared in [`site.config.ts`](site.config.ts)).

## What ships

Two artifacts, deployed independently:

| Artifact | Produced by | What it is |
|---|---|---|
| `dist/` | `bun run build` | Pre-rendered static HTML, one file per route, plus hashed assets, `sitemap.xml` and `robots.txt` |
| the API | `bun dev/api.ts` (or your process manager) | bun-router serving `/api/*` — auth, reviews, moderation, uploads |

stx is a **build-time** templating engine here: every page in `dist/` is
already rendered HTML. There is no Node render server for the frontend and
**no package publish step** is needed to deploy — the built artifact is
self-contained.

## The deploy contract

The host must provide two things that are **not** part of the built artifact.
A host that skips them serves a site that looks fine and is broken in two
specific ways.

### 1. Rewrite `/verify-email/:id/:token` → `/verify-email.html` (status 200)

Verification tokens are minted per request, so unlike every other dynamic
route there is no finite set of pages to pre-render. Without this rewrite the
link in **every signup confirmation email 404s**.

It must be a *rewrite*, not a redirect: `Bench/VerifyEmail` reads the id and
token off `location.pathname`, so the URL has to survive.

### 2. Proxy `/api/*` → the API origin (same-origin, status 200)

Every store calls the API with a **relative** path (`/api/auth`, `/api/me`,
`/api/judges`, …). The dev server proxies this; a static host does not.
Without the proxy every API call resolves against the static origin and 404s,
so the site renders its shells and then stays empty forever.

`preview.ts` fakes both locally so the built artifact can be exercised
end-to-end before shipping — that is a local convenience, not a substitute for
configuring them at the host.

### 3. Rewrite the non-enumerated dynamic routes to their shells

Only the canonical `/judges/:id` page is pre-rendered. Six pre-rendered pages
per judge took the build to 20,028 pages and an out-of-memory death, so the tab
routes and the auth-gated review forms are served from a shell instead:

| Request | Serve (status 200) |
|---|---|
| `/judges/:id/profile`, `/reviews`, `/rulings`, `/cases` | `/judges/:id.html` — that judge's own page |
| `/judges/review/:id` | `/judges/review.html` |
| `/review/:id` | `/review.html` |

Note the first one carries the id through, so it is a capture rewrite, not a
fixed target: `^/judges/([^/]+)/(?:profile|reviews|rulings|cases)/?$` →
`/judges/$1.html`. As with the verify-email rule these must be **rewrites**,
not redirects — the components read the id and the active tab off
`location.pathname`, so the URL has to survive.

`preview.ts`'s `SHELL_REWRITES` is the source of truth for these; the
conformance gate parses that array to check every dynamic route is either
pre-rendered or rewritten, so adding a route there keeps the two in step.

On CloudFront these are both cache behaviours: an `/api/*` behaviour with the
API as origin, and a CloudFront Function (or a `/verify-email/*` behaviour)
rewriting the URI. On nginx/Caddy they are a `try_files`/`rewrite` and a
`proxy_pass`. Whatever the host, **these two are the deploy contract.**

## Environment

`APP_URL` is the one variable the *build* reads. It is baked into canonicals,
Open Graph tags, the JSON-LD graph, `sitemap.xml` and `robots.txt`, so it must
be the production origin at build time, not at serve time.

| Var | Purpose | Notes |
|---|---|---|
| `APP_URL` | Canonical origin, baked into the artifact | **Required for a deployable build.** Unset ⇒ the gate fails with `APP_URL unset — artifact carries N loopback URLs` |
| `APP_ENV` | `production` | |
| `APP_KEY` | Encryption/signing key | `./buddy key:generate` |
| `DB_CONNECTION` / `DB_*` | Database | dev is `sqlite`; production should be `postgres` |
| `MAIL_*` | SMTP | **On the critical path** — email verification and password reset do not work without it. Dev points at a local catcher (`127.0.0.1:2525`) |
| `FILESYSTEM_DISK` | `local` or `s3` | Review photos + avatars. See `app/Storage/disk.ts` |
| `AWS_*` | S3 credentials | Only when `FILESYSTEM_DISK=s3` |
| `API_ORIGIN` | Where `preview.ts` forwards `/api/*` | Local preview only; defaults to `http://localhost:4008` |
| `TS_ANALYTICS_*` | Analytics endpoint override | Optional; the App ID lives in `config/ts-analytics.ts` |

Local ports: views `4000`, API `4008`.

## Build

```bash
APP_URL=https://benchreview.org bun run build
```

The build runs `buildApp()` (stx SSG) and then splices in, in order: per-page
SEO head tags, `noindex` markers, per-entity SEO for dynamic pages, canonicals,
the analytics tag, webfont tags, the CSP meta, and finally a DB-derived
`sitemap.xml` + `robots.txt`. See [`build.ts`](build.ts).

> Dynamic routes (`/judges/:id`, `/court-houses/:id`, `/article/:id`) are
> enumerated from the **database** at build time via `getStaticPaths`. Building
> against an empty database produces zero entity pages and the gate fails with
> `no pages for: judges, court-houses, article`. Seed or restore the database
> before building for release.

## Validate before shipping

```bash
bun run gate              # build + 17 build/SEO integrity checks
bun run ui:validate       # accessibility lint over resources/
bun run visual:validate   # headless-Chrome contrast / overflow / focus audit
bun run release:validate  # route text contracts, assets, metadata, migrations
```

`release:validate` asserts that `sitemap.xml` and `robots.txt` name
`benchreview.org` and contain no `localhost` URLs, so it **only passes on a
build made with a production `APP_URL`**. That is deliberate: it is the check
that catches a dev artifact being shipped.

`visual:validate` needs a Chrome or Chromium binary; set `CHROME_PATH` if it
isn't in a standard location. Screenshots land in
`storage/logs/visual-contract/`.

## Preview the real artifact

```bash
bun run preview           # serves dist/ on :3001, proxies /api to :4008
```

This is the only way to exercise what actually ships: the dev server has the
API but serves from source (so it shows none of the build-time output), and
`dist/` alone has no API.

## After deploying

```bash
bun run deployment:smoke
```

Hits the live domain and asserts the homepage marker, a login form, `/api/health`
(including `checks.database.ok`), `robots.txt`, and that no page ships
unresolved stx expressions in attributes. Override the target with
`SMOKE_BASE_URL`; tune retries with `SMOKE_ATTEMPTS` / `SMOKE_RETRY_MS`.

Health is served at **`GET /api/health`** and answers `503` when the database
or cache probe fails, so a plain HTTP check gets the right answer without
parsing the body. See [`app/Support/health.ts`](app/Support/health.ts).

## Database

Migrations are plain SQL under `database/migrations/`, applied with
`./buddy migrate`. Seeders under `database/seeders/` are idempotent and keyed
on natural keys, so re-running is safe.

> The migrations directory currently mixes two timestamp epochs — 10-digit
> (seconds) and 13-digit (milliseconds) filenames — because a scaffold sync
> renumbered some tables. Filename sort therefore interleaves the two families.
> Ordering happens to still be correct (every `create` precedes its `alter`),
> but add new migrations with the 13-digit form and treat the directory as
> needing a deliberate cleanup pass.

## Outstanding before first deploy

1. **Pick a host** and implement the two deploy-contract rules above.
2. **`config/cloud.ts` is still stock Stacks** — it declares sites for
   `stacksjs.org`, `docs.stacksjs.org`, `tlsx.stacksjs.org` and an AWS
   serverless target. Nothing in it describes bench-review. Either rewrite it
   for the chosen host or delete it; do not assume `./buddy deploy` works.
3. **Set a production `APP_URL`** — without it the artifact is not deployable.
4. **Configure real SMTP** — verification and password reset are dead without it.
5. **Seed or restore the database** so dynamic pages are pre-rendered. Federal
   coverage comes from `bun scripts/ingest-courtlistener.ts` followed by
   `bun scripts/enrich-courthouse-geodata.ts`; both are idempotent and safe to
   re-run after each quarterly CourtListener snapshot.
6. **`MAIL_FROM_ADDRESS`** still reads `no-reply@benchreview.com`; the
   canonical domain is `benchreview.org`.
