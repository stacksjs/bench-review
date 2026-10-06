# Bench Review

[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](./LICENSE.md)

A public directory of judges, with first-hand reviews from the attorneys,
clerks, and court staff who appear before them. Think Yelp, for the bench.

Built as a [Stacks](https://github.com/stacksjs/stacks) app: `defineModel()`
for schema, [stx](https://github.com/stacksjs/stx) for views, Crosswind for
styling, and `buddy` for everything else.

> [!WARNING]
> **Pre-launch.** The application surface is substantially complete, but the
> directory has no production content yet — building against an empty database
> produces zero judge and courthouse pages. Content ingestion is the open
> blocker. See [Status](#status).

## What it does

**The directory** — judges and courthouses, each with a profile, a reviews
tab, and (for judges) recent rulings. Courthouses carry real building-level
coordinates and render on a Leaflet/OSM map.

**Reviews** — a rich-text editor with server-side draft autosave (so a draft
survives a device change), photo upload that strips EXIF and emits a
three-size resize ladder, 1–5 star ratings, threaded comments, and a
"helpful" vote with a denormalised counter so public feeds stay `COUNT`-free.
Reviews can be posted anonymously; the reviewer label is derived through a
helper built to avoid de-anonymisation.

**Moderation** — an admin surface with queues for flagged reviews, judge
submissions, and credential claims, plus user suspension (reversible) and
deletion, and an append-only moderation audit log recording who did what.

**Trust** — reviewers can submit a credential claim (role + state) that an
admin verifies out of band. Judges can claim their own profile and post an
official response to a review of them; the same right-of-reply is also
available admin-mediated.

**Accounts** — registration, login, email verification (with resend),
password reset, password change, and sign-out-everywhere. Plus data export and
self-serve account deletion with a full cascade.

**Public hygiene** — a DB-derived sitemap and robots.txt, per-page canonical /
Open Graph / Twitter tags, a JSON-LD Organization + WebSite + WebPage graph,
and a Content-Security-Policy with every inline script hashed. Rate limits sit
on every public and mutating endpoint.

## Stack

| Layer | What |
|---|---|
| Framework | [Stacks](https://github.com/stacksjs/stacks) |
| Views | [stx](https://github.com/stacksjs/stx) — build-time rendered, no frontend render server |
| Styling | Crosswind (Tailwind-compatible utilities) |
| Data | `defineModel()` + [bun-query-builder](https://github.com/stacksjs/bun-query-builder); SQLite in dev, Postgres in production |
| Search | Meilisearch configured; the UI still filters client-side |
| Images | sharp (EXIF strip + resize) |
| Storage | `app/Storage/disk.ts` — local disk or Bun-native S3 via `FILESYSTEM_DISK` |
| Lint | [pickier](https://github.com/stacksjs/pickier) (never eslint directly) |

## Getting started

```bash
bun install
cp .env.example .env
./buddy key:generate
./buddy migrate
./buddy seed
./buddy dev
```

Views come up on `:4000`, the API on `:4008`.

> `./buddy seed` loads 6 courthouses, 24 judges, and a handful of reviews —
> enough to exercise every page, not enough to be a product.

## Layout

```
app/
  Actions/        one file per endpoint, grouped by surface (Reviews, Judges, Admin, Me, …)
  Models/         defineModel() schema; `useApi.routes` is OPT-OUT — always state it
  Helpers/        SEO head injection, sitemap, CSP, review photos, storage disk
  Support/        health endpoint
resources/
  views/          one file per route; dynamic routes enumerate via getStaticPaths
  components/     Bench/* — the real UI lives here
  stores/         all data access goes through a store, never a fetch in a component
  layouts/        page shells
routes/api.ts     hand-written API routes (auto-prefixed with /api)
database/         plain-SQL migrations + idempotent seeders
scripts/          the validation suite (see below)
site.config.ts    single source of truth for name / url / SEO
gate.ts           17-check build + SEO conformance gate
```

## Quality gates

```bash
bun run lint             # pickier
bun run typecheck:app    # app-owned TypeScript
bun run gate             # build + 17 build/SEO integrity checks
bun run ui:validate      # accessibility lint over resources/
bun run visual:validate  # headless-Chrome contrast / overflow / focus audit
bun run release:validate # route text contracts, assets, metadata, migrations
bun run deployment:smoke # post-deploy checks against the live domain
```

`release:validate` only passes on a build made with a production `APP_URL` —
that is the check that catches a dev artifact being shipped.

## Deploying

See [DEPLOY.md](./DEPLOY.md). The short version: the build produces a static
`dist/` plus an API process, and the host must provide two things the artifact
cannot — an `/api/*` proxy and a `/verify-email/:id/:token` rewrite.

## Status

Working and verified: the full review lifecycle, moderation, auth, privacy
export/delete, SEO surface, and rate limiting. `lint`, `typecheck:app`,
`ui:validate` and `release:validate` are green; `gate` is 16/17.

Open before launch:

1. **Content ingestion** — the directory is empty, so no entity pages render.
   This is the one blocker that makes the rest moot.
2. **A host** — `config/cloud.ts` is still stock Stacks and describes
   `stacksjs.org`, not this app.
3. **Production SMTP** — email verification and password reset depend on it.
4. **`routes: []` on `app/Models/Request.ts`** — it currently declares
   `useApi: true` with no `routes`, which the ORM generator turns into
   unauthenticated full CRUD at `/api/requests`.
5. **`HttpOnly` on the auth cookie** — the token is readable from JS today.
6. **Tests** — `tests/` is still placeholder stubs.
7. **`docs/`** — still the inherited Stacks framework documentation; either
   curate it for this app or remove it.

## License

[MIT](./LICENSE.md)
