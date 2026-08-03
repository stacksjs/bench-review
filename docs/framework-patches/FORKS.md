# Linked framework forks (bench-review)

Two forks carry unpublished patches bench depends on. They are declared as native
`file:` dependencies in `package.json` — **no install script** — so `rm -rf node_modules
&& bun install` re-materializes them from the fork dirs. With `linker = "hoisted"` bun
**copies** a `file:` dep into node_modules (not a symlink), so it captures the fork's
prebuilt `dist/` at install time; live edits to a fork need a reinstall to take effect.
The fork dirs must exist and be built (`dist/` is gitignored in each fork repo).

| Package | package.json `file:` path | Fork dir | HEAD | Why forked |
|---|---|---|---|---|
| bun-query-builder | `../../Projects/bun-query-builder/packages/bun-query-builder` | ~/Documents/Projects/bun-query-builder | 791f632 | 0.1.59 saveMigrationSnapshot, paginate WHERE shim, savepoint guard |
| ts-medium-editor | `../ts-medium-editor` | ~/Documents/Stacks/ts-medium-editor | 90a6de8 | toolbar collapsed-selection fix (unpublished past 0.1.0) |

**The stx monorepo fork (@stacksjs/stx + bun-plugin-stx) is NOT linked** — its dist was
stale vs published 0.2.152 (missing `bracketPathToRegex`); bench uses published stx.
Both forks above have zero `workspace:*` deps, which is why `file:` linking works for them
(the stx sub-packages' workspace siblings are what made `file:` fail there).

Published baseline at conversion: stacks 0.70.190 (transitives float to latest 0.70.x),
@stacksjs/stx 0.2.152, @stacksjs/components 0.2.152.

## Deferred bun patch — ORM schema generator

`orm-generate-database-schema.patched.ts` is bench's patched copy of
`@stacksjs/orm`'s `generate-database-schema.ts` (reads the validator NAME, not the
non-existent `attr.type`, to type model-row columns; cut app `as any` 490→119).
It only runs on `buddy generate:db-types`. The generated `database/types.d.ts` is
already committed, so nothing regresses at runtime. Re-home as `bun patch @stacksjs/orm`
before the next schema regeneration, or the casts come back.
