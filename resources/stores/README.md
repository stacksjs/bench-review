# The Stores Folder

Every request bench makes to its own API starts in this folder. Components do
not call `fetch`. A component asks a store for data or hands it an action, and
the store owns the URL, the headers, the error shape and the retry/401
behaviour.

That rule is load-bearing rather than stylistic — the anti-enumeration
behaviour on password reset is a good example. `/api/auth/password/forgot`
answers 404 for an unknown address, and something has to decide that a 4xx
still means *"if an account exists, we sent you a link"*. While that decision
lived in the view, a second caller handling the status itself would have
reintroduced the oracle. In `auth.requestPasswordReset` it cannot: the store
never reports the difference to anyone.

## Why not `useQuery` / `useMutation`

stx ships both, and stx-standards §6.6 makes them a MUST. bench deviates, for
three reasons, all checked against `@stacksjs/stx@0.2.176`:

1. **`useQuery` is component-scoped by construction.** It starts its request
   with `onMount(fetchData)` (`signals.js:1537`) and registers its cleanup
   with `onDestroy` (`:1549`, `:1565`, `:1569`). A store is built at
   `defineStore` time, outside any component mount, so there is no mount for
   it to hang off.

2. **Using them as documented would put `fetch` back in the component.**
   §6.6's own example declares `useMutation('/login', …)` inside the view.
   That is coherent for an app without this folder; here it would undo the
   rule above and scatter the error shapes again.

3. **Its headline benefit does not apply to bench.** The `_queryCache` is a
   module-scope cache that survives fragment swaps, which is what makes it
   worth having. bench's built site ships no client router — every navigation
   is a full document load — so the cache would be discarded on every page
   change. Within a single page, the stores already deduplicate: one store,
   one request, every component reading the same signals.

What bench keeps from §6.6 is the part that matters: no raw `fetch` with an
ad-hoc `loading`/`error` pair scattered across views. `grep -E 'fetch\(' resources --include='*.stx'`
is 0. The `loading` / `error` signals that remain in views are per-form UI
state, not duplicated request plumbing.

Revisit if `useQuery` gains a mount-free trigger.

## Conventions

- One store per file, named for its `defineStore` id.
- No value imports from outside this folder — the store bundler strips them
  and you get a `ReferenceError` at `defineStore` time with no other symptom.
  Inline the helper, or reach it lazily through `useStore('owner').helper()`.
- Actions return a plain result (`{ ok, message? }`) rather than throwing, so
  a caller cannot forget a `catch` and lose the error.
- Name a component's local store const distinctly from the store's own
  exports (`const judgesStore = useStore('judges')`): a const that collides
  with a top-level export of an imported module gets renamed by the bundler,
  and the template silently binds to the import instead.
