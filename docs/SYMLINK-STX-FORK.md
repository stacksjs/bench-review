# Symlinking the local stx fork into bench-review

Point bench at your local stx fork (`~/Documents/Projects/stx`) instead of the
published `@stacksjs/stx`, so bench runs your unreleased fixes.

## Why the "obvious" ways fail, and this one works

- **`file:` in `package.json` / `overrides`** → bun *installs* the fork, reads its
  `package.json`, sees `workspace:*` deps (`stx-router`, `bun-plugin-stx`,
  `@stacksjs/desktop`, `@stacksjs/sanitizer`) and tries to resolve them **as a
  workspace** → fails. This is the wall you always hit.
- **A raw `ln -s`** → not a dependency bun resolves; the filesystem link is just
  followed, and the fork's own `import 'stx-router'` etc. resolve from the fork's
  **own `node_modules`** (via realpath). No workspace resolution, no wall.

## What bench actually loads (important)

bench resolves `@stacksjs/stx` via the fork's `exports` → **`./dist/index.js`**, NOT
`src`. So the fork's **`dist/` must be built** and current. Editing fork `src` does
nothing to bench until you rebuild.

## The three links

| bench `node_modules/…` | → fork dir |
|---|---|
| `@stacksjs/stx` | `~/Documents/Projects/stx/packages/stx` |
| `bun-plugin-stx` | `~/Documents/Projects/stx/packages/bun-plugin` |
| `stx-router` | `~/Documents/Projects/stx/packages/router` |

---

## Step by step

### 1. Make sure the fork checkout is what you want
```sh
cd ~/Documents/Projects/stx
git status -sb          # on the right branch, clean / at your latest push
git log --oneline -1    # confirm HEAD is the commit you expect
```

### 2. Rebuild the fork's dist (bench loads dist, not src)
Use **stable** bun — a canary build has emitted corrupt re-export chunks before.
`~/.bun/bin/bun` is currently 1.4.0 stable.
```sh
cd ~/Documents/Projects/stx
( cd packages/router     && ~/.bun/bin/bun --bun build.ts )
( cd packages/bun-plugin && ~/.bun/bin/bun --bun build.ts )
( cd packages/stx        && ~/.bun/bin/bun --bun build.ts )
```

### 3. Symlink the three packages into bench
```sh
cd ~/Documents/Stacks/bench-review
FORK=~/Documents/Projects/stx; NM=$PWD/node_modules
rm -rf $NM/@stacksjs/stx $NM/bun-plugin-stx $NM/stx-router
ln -s $FORK/packages/stx        $NM/@stacksjs/stx
ln -s $FORK/packages/bun-plugin $NM/bun-plugin-stx
ln -s $FORK/packages/router     $NM/stx-router
```

### 4. Verify (all three should be symlinks + load cleanly)
```sh
cd ~/Documents/Stacks/bench-review
for p in @stacksjs/stx bun-plugin-stx stx-router; do printf "%-16s → " "$p"; readlink node_modules/$p; done
bun -e "await import('@stacksjs/stx'); await import('stx-router'); await import('bun-plugin-stx'); console.log('load OK')"
```
Optional deeper check — confirm a specific fix is in the dist bench loads, e.g.:
```sh
grep -l "scriptType" node_modules/stx-router/dist/client.js   # 14433bb fragment-swap guard
```

### 5. Restart the dev server
`./buddy dev` — the running server has the *previous* stx loaded; restart so it
picks up the fork.

---

## When to re-apply

- **After any `bun install`** → it reinstalls the published copies and clobbers the
  symlinks. Re-run **step 3**.
- **After any new stx commit / `git pull` in the fork** → bench loads `dist`, so
  re-run **step 2** (rebuild) — the symlinks themselves don't need touching.

## Reverting to published stx
```sh
cd ~/Documents/Stacks/bench-review
rm -rf node_modules/@stacksjs/stx node_modules/bun-plugin-stx node_modules/stx-router
bun install    # restores the published @stacksjs/stx / bun-plugin-stx / stx-router
```

## Gotchas / honest caveats

- **Invisible to git and the lockfile.** The symlinks live in `node_modules`
  (gitignored), and `package.json` (`@stacksjs/stx: ^0.2.82`) + `bun.lock`
  (`0.2.153`) still describe the *published* package. Nothing in version control
  reflects that bench is on the fork — only the filesystem does. That's expected.
- **Machine-local only.** CI / a fresh clone / another machine gets published stx
  (no fork dir, no symlinks). This is a local dev override, not a shipped change.
- **The other linked forks** (`bun-query-builder`, `ts-medium-editor`) go through
  `package.json` `file:` deps because they have **no** `workspace:*` deps — see
  `docs/framework-patches/FORKS.md`. Only the stx monorepo needs the raw-symlink
  trick.
