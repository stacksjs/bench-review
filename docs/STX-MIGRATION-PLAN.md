# bench-review → stx-standards migration plan

Two independent tracks. **Track A** converts the framework-vendoring model from a local
workspace to published deps (bughq's model — no `storage/framework/core`). **Track B** brings
the `.stx` surface to full conformance with the twelve rules in `~/Documents/stx-standards`.

**Decisions locked (2026-08-03):**
- Track A: **convert now**, capture residual patches via `bun patch`, keep the three local forks
  (stx clone, bun-query-builder, ts-medium-editor) as **linked** local deps.
- Track B: **full/aggressive** conformance — types, fetches→stores, shipped-component adoption,
  `strict` on, chase advisories — *without* breaking bench's documented, load-bearing exceptions.

> Ground rules that override "aggressive": never `bun install` or delete `core/` outside an
> approved checkpoint; **never restart the dev server** (`./buddy dev`, ports 4000/4008) — the
> user runs it; lint via `bun pantry/pickier/dist/bin/cli.js lint` (bunx pickier is broken here);
> no `Co-Authored-By` trailer on commits.

---

## 0. Baseline — where bench already stands vs the twelve rules

bench is ~90% conformant out of the gate (bughq's audit baseline was the opposite). Measured
2026-08-03:

| Rule | Status | Evidence |
|---|---|---|
| 1 doc-shell | ✅ clean | only `emails/*` (2) + standalone `500.stx` carry `<!DOCTYPE>`, all correct |
| 4 StxLink | ✅ 269 : 1 | one plain internal `<a>` (`500.stx:53`), 8 external `<a>` (fine) |
| 5 SEO | ✅ better than target | `useHead`/`useSeoMeta` ×17 **+ build-time `app/Helpers/seoPages.ts`** |
| 7 stores | ✅ 15 stores / 82 `useStore` | bughq had zero |
| 9 auto-imports | ✅ 0 hand-imports | |
| 11 script blocks | ✅ 0 files > 2 real blocks | (extra counts are comment mentions) |
| 12 encoding | ✅ server-side sanitize on write | `sanitizeReviewHtml` in all 5 write actions; `x-html` sinks read pre-cleaned |
| **6 components** | ⚠️ **gap** | plugin registered (`plugins/stx-components.ts`), **0 shipped primitives used**; 12 hand-rolled `role="dialog"`/`role="tablist"` |
| 10 types | ⚠️ minor | 8 untyped params in 3 files (RichTextEditor ×5, JudgeSignup ×2, Cases ×1) |
| 2 vanilla DOM | ⚠️ scoped | genuine imperative DOM only in `RichTextEditor` (ts-medium-editor wrapper) + 2 editor seeds; rest is deliberate `window.*` |
| 3 vanilla CSS | ⚠️ sanctioned | 6 component-body `<style>` (the `@push`-SPA-nav workaround) + 3 page-level (403/500/home) |
| 8 strict | ⚠️ off | `strict` unset; deliberate `window.*` + editor DOM to accommodate |
| — fetch-in-component | ⚠️ 3 | `JudgeSignup.stx:43`, `BenchComingSoon.stx:34`, `VerifyEmail.stx:37` should route through a store |

### bench's sanctioned exceptions — DO NOT "fix" these (aggressive ≠ break)
1. **Component-body `<style>` blocks** — `@push` styles don't survive SPA nav; component-scoped
   `<style>` renders into `<main>` and does. Keep (Feed, ReviewsFeed, BlurReview, RichTextEditor,
   ArticleView, Court/CourtReviews).
2. **`window.`-prefixed globals** — bare `location`/`history` get shadowed by store signals in stx
   scopes (documented). `window.`-prefix is the fix. Migrate only the *pure-navigation* ones to
   `navigate()` (a function call, not shadowed); allowlist the rest (`window.scrollTo`,
   `window.history.replaceState` param-scrub, `window.localStorage`).
3. **RichTextEditor imperative DOM** — a wrapper around `ts-medium-editor`; DOM building is
   inherent. Allowlist, do not rewrite to directives.
4. **Build-time `seoPages.ts`** — first-crawl/social scrapers don't run JS; keep alongside runtime
   `useHead`.
5. **Standalone `500.stx`** — owns its own shell so it renders when the runtime is down. Keep
   (add `@nolayout` semantics if the shell ever trips the DOCTYPE gate).

---

## 1. Current resolution topology (what Track A dismantles)

Three overlapping layers resolve the framework today:

| Layer | Mechanism | Under conversion |
|---|---|---|
| **Vendored `stacks`** | `package.json` `"stacks": "workspace:*"` + `workspaces:["storage/framework/**"]` → **168MB `storage/framework/core`** (buddy, actions, orm, server, router, …) | **replaced** by published `stacks@^0.70.190` |
| **stx fork** | `pantry/@stacksjs/stx → ~/Documents/Projects/stx/packages/stx`; `pantry/bun-plugin-stx → …/stx/packages/bun-plugin` | **stays linked** (carries serve.js `no-store`, nested-route, `signals.js` body-scope-walk patches) |
| **bqb fork** | `pantry/bun-query-builder → ~/Documents/Projects/bun-query-builder/packages/bun-query-builder` (0.1.59, lockstep) | **stays linked** |
| **medium-editor fork** | `pantry/ts-medium-editor → ~/Documents/Stacks/ts-medium-editor` (unpublished fix `50039f8`) | **stays linked** |
| **crosswind** | `pantry/@cwcss/crosswind` (real dir) | unchanged (pantry) or move to published `@cwcss/crosswind` |
| **router** | `pantry/@stacksjs/router → storage/framework/core/router` | **repoint** to published `stacks`'s router |

Residual local patches **not** carried by a linked fork (the `bun patch` list):
- `storage/framework/core/orm/src/generate-database-schema.ts` — ORM schema generator
  (validator-name column typing; app `as any` 490→119). Moves to `node_modules/@stacksjs/orm` →
  capture as `bun patch`, or re-run generation post-install and diff.

Everything else in `core/` is stock 0.70.190 and comes from the published package.

---

## Track A — Framework model conversion

> **✅ DONE 2026-08-03 — commit `6cd9bf7c`, branch `chore/stacks-node-modules`.** `storage/framework/core`
> deleted; `stacks` is a published dep (pinned `0.70.190`, transitives at `0.70.251`, locked in
> `bun.lock`); `workspaces` removed. Forks kept via `scripts/link-forks.ts` postinstall overlay —
> **bqb + ts-medium-editor only; the stx monorepo fork was dropped** (stale dist vs published 0.2.152,
> missing `bracketPathToRegex`) so bench uses published stx. Model bumps are now
> `rm -rf node_modules && bun install`. Verified: framework resolution, model globals via
> `injectGlobalAutoImports`, runtime module load, `./buddy --help`. **Pending user smoke:** restart
> `./buddy dev`, confirm pages render + DB works (watch the bqb fork at framework 0.70.251).

### Stage A0 — Preflight capture (SAFE; no install, no delete)
**Goal:** make the conversion reversible and prove the patch surface before mutating anything.
1. `git switch -c chore/framework-node-modules` — dedicated branch; the 168MB delete + lockfile
   churn stays isolated and revertible.
2. Snapshot the exact patch delta: for each linked fork, record the upstream base commit + local
   diff (`git -C ~/Documents/Projects/stx diff`, same for bqb, ts-medium-editor). Save to
   `docs/framework-patches/` so a fork re-clone can reproduce them.
3. Capture the ORM generator patch as a standalone diff against stock 0.70.190
   (`gh api .../generate-database-schema.ts?ref=v0.70.190` vs local) → `docs/framework-patches/orm-generate-database-schema.patch`.
4. Record the auto-imports barrel state (the v0.70.190 collision gotcha) so we can detect a
   regression post-install: `grep -oE "export \{[^}]*\}" storage/framework/auto-imports/functions.ts | … | uniq -d` must be empty.
5. `bun pantry/pickier/dist/bin/cli.js lint` + `bun x tsc --noEmit` → record the green baseline.

**Verify:** branch created, `docs/framework-patches/` holds one diff per fork + the ORM patch,
baseline lint/tsc numbers written down. **No runtime change.**

### Stage A1 — Flip the deps (edit only; still no install)
**Edits to `package.json`:**
- `"stacks": "workspace:*"` → `"stacks": "^0.70.190"`.
- Remove the `workspaces` array (the `storage/framework/**` glob is the workspace link to `core`).
- Keep `@stacksjs/components`, `@stacksjs/stx`, `bun-plugin-stx`, `ts-medium-editor` — but point the
  three forks at their local paths so install links instead of fetching:
  `"@stacksjs/stx": "link:~/Documents/Projects/stx/packages/stx"` (+ `bun-plugin-stx`,
  `bun-query-builder`, `ts-medium-editor`) **or** bun `[install] link` in bunfig. (A0's diffs are
  the fallback if a link path is rejected.)
- Add `"patchedDependencies": { "@stacksjs/orm@0.70.190": "patches/…" }` once A2 generates it.
**bunfig.toml:** already `linker="hoisted"` on npm registry — no change. Preload path
`./storage/framework/defaults/resources/plugins/preloader.ts` **survives** (`defaults/` is not
deleted). Confirm `preloader.ts`'s `skipAutoImports` logic still holds without `core/`.

**Verify:** `git diff package.json` reviewed; no install yet.

### Stage A2 — Install + re-home patches (⚠️ CHECKPOINT — first destructive step)
**This reverses "pantry-only." Requires go-ahead. May disrupt the running dev server's
resolution — coordinate timing with the user.**
1. `bun install` — populates `node_modules/@stacksjs/*` from published `stacks`, links the 3 forks.
2. `bun patch @stacksjs/orm` → apply the A0 ORM diff → `bun patch --commit` → writes
   `patchedDependencies`. (Or, if regeneration is cleaner: run `./buddy generate:db-types` and
   diff — accept whichever reproduces the 119-`as any` state.)
3. Re-verify the auto-imports barrel has no duplicate exports (A0 check) — the collision gotcha
   is the highest-probability post-install break.
4. Fix the nested `bun-plugin-stx/node_modules/@stacksjs/stx` symlink if bun didn't hoist it
   (documented: symlink → `../../../@stacksjs/stx` after install).

**Verify:** `node_modules/@stacksjs/stx` resolves to the fork; `bun -e "import('@stacksjs/stx')"`
loads; `typeof globalThis.Judge === 'object'` after `injectGlobalAutoImports()`.

### Stage A3 — Delete `core/` + repoint (⚠️ CHECKPOINT)
1. `git rm -r storage/framework/core` (168MB). Keep `storage/framework/{defaults,api,auto-imports,…}`.
2. Repoint `pantry/@stacksjs/router` (was → `core/router`) to the published router, or drop the
   pantry symlink if node_modules now wins.
3. `.gitignore`/pantry cleanup: pantry becomes vestigial (like bughq's). Decide keep-minimal vs
   remove; if removed, re-verify crosswind + pickier resolve from node_modules.
4. Update `buddy`/`bootstrap`/scripts that hard-reference `storage/framework/core` paths.

**Verify:** `rg "storage/framework/core" --glob '!docs/**'` returns only intentional refs.

### Stage A4 — Boot + smoke (no dev-server restart — use a separate probe)
1. Foreground boot probe (separate port/instance, not the user's 4000/4008):
   `NODE_PATH=$PWD/pantry? bun dev/api.ts` in foreground to surface real errors (the 4008
   silent-fail pattern). Confirm `/api/judges` 200, model globals defined.
2. `bun x tsc --noEmit` — expect ~619 baseline (the faker debt), not a regression.
3. `bun pantry/pickier/dist/bin/cli.js lint` (or node_modules pickier if pantry retired) → 0 new.
4. SPA-nav smoke via the standards' probe harness (bench-adjusted ports): `/ → /reviews`
   (different layouts — the `signals.js` body-scope-walk patch must still fire), `/article/:id`
   hydration, RichTextEditor mount.

**Rollback:** `git checkout main && bun install` restores the workspace model from the branch.

---

## Track B — full conformance (independent of A; gate scripts assume A is done)

> **✅ ACTIONABLE ITEMS COMPLETE 2026-08-04 (commits a0d2ed67, d21f6761, 8adb57e0, bf9f4b89, 2e48bb45).**
> B1 comments (ch 12.5: 207 `<!-- -->` → `{{-- --}}`, 13 backtick landmines killed). B2 Rule 10 types (8
> params). B3 fetches→stores (component `fetch()` 3→0; new `subscribe` store). B4 Rule 8 strict mode
> (warn-only, allowlist covers all 66 hits → safe to flip later). B5 app-tsc **62→0**.
> **Rule 6 (component adoption) = SANCTIONED EXCEPTION, not done via swap:** shipped `@stacksjs/components`
> `Dialog`/`Switch` interpolate `{{ }}` inside `<script client>` — the stx#1757 escaped-entity pattern that
> broke bench's `Notification` (→ toast store). bench's hand-rolled dialogs/switches are the correct
> workaround. `Tabs` (no client-script interp) is the only safely-adoptable family; deferred as low-value.
> Revisit if stx#1757 is confirmed fixed in a running 0.2.152 app.

### Stage B0 — Turn on `strict` + declare stx-engine config
bench has **no** stx-engine config (`config/stx.ts` absent; `config/ui.ts` is Crosswind-only). Add
a real stx config (resolved as `{name:'stx',alias:'ui'}` — verify which file the running server
reads; the serve path uses a **closed allowlist**, so `strict`/`router`/`app` are forwarded but
`root`/`pagesDir`/`storesDir`/`plugins` are **inert** there — don't rely on them).
```ts
strict: {
  enabled: true,
  failOnViolation: false,               // warn-first; flip after B4
  allowPatterns: [
    // ts-medium-editor wrapper — inherent DOM; see RichTextEditor.stx
    // window.scrollTo / history.replaceState — no composable equivalent; anti-shadowing
  ],
}
```
Capture the warn list as the B-track work queue. **Verify:** `strict` key present; warn report
emitted to the API terminal.

### Stage B1 — Types (Rule 10; trivial)
Annotate the 8 params: `RichTextEditor.stx` (98,149,236,249,281), `JudgeSignup.stx` (24,55),
`Cases.stx:60` (+ its string return). **Verify:** the ch.10 grep returns empty for touched files.

### Stage B2 — fetches → stores
Move the 3 component `fetch()`es into stores (bench's own rule): `JudgeSignup` → `judges` store
search method; `BenchComingSoon` → a subscribe store/action; `VerifyEmail` → `auth` store method.
Watch the documented store-bundler pitfall (value imports outside `resources/stores/` are dropped).
**Verify:** `rg "fetch\(" resources/components` → empty; typeahead + subscribe + verify still work.

### Stage B3 — shipped-component adoption (Rule 6; the real gap, highest risk)
Replace the 12 hand-rolled primitives with `@stacksjs/components`, **one family at a time, each
behind an SPA-nav probe** (bench has a history of component swaps regressing hydration):
- `role="dialog"` → `<Dialog>`: `ConfirmHost`, `MobileMenu`, `Modal/BaseModal`, `Modal/PricingModal`
  (verify focus-trap/Escape parity; ConfirmHost is load-bearing).
- ~~`role="tablist"` → `<Tabs>`: `MyReviewsView`, `Court/CourtHouseDirectory`, `Judge/JudgeDirectory`.~~
  **✅ RESOLVED 2026-08-10 — but NOT by adopting `<Tabs>`. Do not re-attempt the swap.**
  On inspection all 7 `role="tablist"` blocks (20 `role="tab"` buttons) are **URL-driven filter
  pills**, not tabs: they filter the list below via `?status=` / `?state=` / `?practice_area=`,
  carry live counts, and several are generated with `:for` over data. The app has **zero
  `role="tabpanel"`, zero `aria-controls`, and zero `aria-selected`** — so the markup was
  announcing "tab" to a screen reader while controlling no panel and exposing no selected state
  (`role="tab"` *requires* `aria-selected`). Shipped `<Tabs>` is the wrong abstraction: it owns
  its own `activeTab`, discovers `<TabPanel>` children and toggles their `hidden` — none of which
  maps to "filter an external list from a URL param", and adopting it would have **lost** the
  URL-driven state, the counts and the dynamic generation.
  Fixed as what they actually are: `role="group"` + `aria-pressed` toggle buttons, with a static
  `aria-pressed="false"` for the pre-hydration/pre-rendered pass and `x-aria-pressed` for the
  reactive state (the same idiom as `BenchHeader.stx`'s `x-aria-expanded`). Verified `x-aria-*`
  routes through stx's generic attribute binder (`signals.ts:2664-2688`) and that the static and
  reactive forms coexist through a render.
- alert/toggle switches → `<Switch>` where applicable.
Respect the known stx component pitfalls (no `<template>` hosts; no custom-element tags; empty-scope
`<script client>` needs a real derived; component const must not collide with an imported export).
**Verify per family:** `spa-probe navs` = SPA, `mainsAfter:1/nested:0`; keyboard pass on dialogs/tabs;
screenshots fresh-vs-via.

### Stage B4 — advisories + strict flip
Timers already clean (0 `setInterval`, all `setTimeout` tracked) — audit, don't churn. Migrate the
pure-navigation `window.location` → `navigate()`; allowlist the rest. Then flip
`strict.failOnViolation: true` and confirm the render doesn't 500. Run `stx a11y` (advisory).
**Verify:** ch.8 greps A/B/C reduced to the allowlisted set; strict throws on a planted violation.

### Stage B5 — enforcement gate (make "done" mechanical)
Port the ch.12 gate script, **bench-adjusted**: ports 4000/4008; pickier via the pantry/node_modules
path; DOM-guard + landmine checks (unbalanced `</script>`, banned tokens in `<!-- -->`, DOCTYPE
w/o `@nolayout`). Add `stx` to the `bun-git-hooks` `staged-lint` glob. Wire as a `package.json`
task. **Verify:** gate exits 0 or every residual is a listed sanctioned exception.

---

## Sequencing & checkpoints

```
A0 (safe) ─┬─ A1 (edit) ─→ [CHECKPOINT] ─→ A2 install ─→ A3 delete ─→ A4 smoke
           │
B1,B2,B10  ┘  (types/fetches/config — model-independent; can land on main anytime)
B0,B3,B4,B5   (strict + component adoption + gate — do after A4 so gates see node_modules)
```
- **Land B1/B2 first** on `main` — small, safe, model-independent wins that shrink the diff.
- **A0 immediately** (safe, reversible groundwork).
- **Pause at the A2 checkpoint** for explicit go-ahead + dev-server timing (install may disrupt
  the running server's resolution).
- **B3 is the riskiest** — stage it component-family by family, each behind a probe.

## Risk register
| Risk | Likelihood | Mitigation |
|---|---|---|
| auto-import barrel collision after install → all model globals `undefined` | high | A0 baseline check + A2 re-check; foreground boot to see the swallowed error |
| bun doesn't link a fork → published pkg silently wins, patches vanish | med | A0 diffs are the reproduction; verify each fork's symlink post-install |
| `bun install` disrupts the running dev server | med | checkpoint + coordinate timing; separate probe port for A4 |
| B3 component swap regresses hydration/SPA nav | med | per-family probe + screenshots; ConfirmHost last |
| strict allowPatterns too broad (rule-global substring match) | low | keep list minimal + commented; prefer `navigate()` migration over allowlisting |
| pantry retirement breaks crosswind/pickier resolution | med | keep pantry minimal until node_modules resolution proven |

## Bench-adjusted verify facts (differ from the standards doc)
- Ports **4000 (web) / 4008 (api)**, not 3100/3108. **Never restart** the user's dev server.
- Lint: `bun pantry/pickier/dist/bin/cli.js lint` (bunx pickier broken) until pantry retired.
- SEO is build-time (`seoPages.ts`) + runtime `useHead` — the "useSeoMeta only" target doesn't apply.
- Config alias resolves via `config/ui.ts` (Crosswind) — confirm where the *stx-engine* config is
  read before trusting any `layoutsDir`/`strict` edit (serve-path allowlist caveat).

---

*Separately tracked (feature work, not this migration): inline admin moderation on the review page,
the "undefined people find this helpful" like-count bug, report-review on the `/reviews` feed.*
