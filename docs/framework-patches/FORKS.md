# Linked framework forks (bench-review)

These three repos are linked into node_modules (unpublished patches bench depends on).
After any `rm -rf node_modules && bun install`, bun re-links them from package.json `file:` deps.
Their `dist/` is prebuilt and gitignored in-repo — the fork dirs must exist and be built.

| Package | Fork path | HEAD (2026-08-03) | Why linked |
|---|---|---|---|
| @stacksjs/stx + bun-plugin-stx | ~/Documents/Projects/stx | 316f9e2a | serve.js no-store, nested dynamic routes, signals.js body-scope-walk (SPA rebind) |
| bun-query-builder | ~/Documents/Projects/bun-query-builder | 791f632 | 0.1.59 saveMigrationSnapshot, paginate WHERE shim, savepoint guard |
| ts-medium-editor | ~/Documents/Stacks/ts-medium-editor | 90a6de8 | toolbar collapsed-selection fix (unpublished past 0.1.0) |

Published baseline at conversion: stacks 0.70.190, @stacksjs/stx 0.2.152, @stacksjs/components 0.2.152.

## Deferred bun patch — ORM schema generator

`orm-generate-database-schema.patched.ts` is bench's patched copy of
`@stacksjs/orm`'s `generate-database-schema.ts` (reads the validator NAME, not the
non-existent `attr.type`, to type model-row columns; cut app `as any` 490→119).
It only runs on `buddy generate:db-types`. The generated `database/types.d.ts` is
already committed, so nothing regresses at runtime. Re-home as `bun patch @stacksjs/orm`
before the next schema regeneration, or the casts come back.
