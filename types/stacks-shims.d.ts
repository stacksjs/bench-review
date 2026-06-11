// Ambient shims for the vendored @stacksjs/* core packages that ship dist JS
// WITHOUT a built `dist/index.d.ts` (their package.json `types` field points
// at a file that isn't generated in this checkout). The shared framework
// tsconfig works around the missing types by mapping `@stacksjs/* → src`, but
// that drags the entire unbuilt framework source into an app typecheck (~900
// errors that say nothing about app health).
//
// For the app-scoped `typecheck` (tsconfig.app.json) we resolve these modules
// to `any` instead, so app code type-checks on its own merits without
// type-checking framework source. No real fidelity is lost: these packages
// expose no built declarations regardless. Packages that DO ship dist types
// (e.g. @stacksjs/validation) are intentionally absent here so they keep their
// real types via normal node resolution.
// Wildcard fallback: any @stacksjs/* package whose dist lacks built types
// resolves to `any`. Packages that DO ship dist `.d.ts` (e.g.
// @stacksjs/validation) win via normal node resolution — a wildcard ambient
// module is only a fallback, so their real types are preserved.
declare module '@stacksjs/*'
