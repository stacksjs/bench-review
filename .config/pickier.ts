import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: false,
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/bin/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/bun.lock',
    '**/benchmarks/**',
    '**/.claude/**',
    '**/.zed/**',
    '**/docs/**',
    // Vendored / generated bundles — not source we maintain
    'public/js/*-bundle.js',
    'storage/framework/actions/package.js',
    // The vendored stacks framework. Tracked, but authored upstream and synced
    // in wholesale — its style is upstream's, not ours. Linting it made
    // `bun run lint` emit 2090 warnings of which exactly ONE was bench's own
    // (config/deps.ts), so "lint clean" carried no information about this app.
    // 2076 of those were markdown rules on `defaults/ai/skills/**` docs.
    '**/storage/framework/**',
    // Local package overrides (gitignored, rebuilt from source elsewhere).
    '**/pantry/**',
  ],
  lint: {
    // `stx` is here so the 124 templates under resources/ get lint coverage at
    // all — without it pickier skips them outright, even when one is named
    // explicitly on the command line.
    //
    // Today that buys exactly one rule's worth of signal:
    // `pickier/sort-tailwind-classes`. Nothing else fires, because every other
    // plugin (ts/general/quality/regexp/node/eslint/unused-imports) gates
    // itself on a JS/TS extension. The checks that actually catch stx bugs live
    // in stx itself — the `strict` client-script guard in config/ui.ts and
    // `stx typecheck` — not here. Keep both; this is additive, not a
    // replacement.
    //
    // CAVEAT, worth knowing before running `lint:fix`: pickier disables its
    // `indent` CHECK for stx/html/vue but not the corresponding FIXER (which
    // receives no file path, so it cannot make the same exclusion). `--fix`
    // therefore snaps leading whitespace to the 2-space grid in .stx files
    // while reporting nothing — 415 comment-continuation lines here, all
    // odd -> even. Harmless, and already applied, so the tree is at a fixed
    // point; just don't be surprised by an unexplained diff.
    extensions: ['ts', 'js', 'md', 'stx'],
    reporter: 'stylish',
    cache: false,
    maxWarnings: -1,
  },
  format: {
    extensions: ['ts', 'js', 'json', 'md', 'yaml', 'yml'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    quotes: 'single',
    semi: false,
  },
  rules: {
    noDebugger: 'error',
    noConsole: 'off',
  },
  pluginRules: {
    'ts/no-explicit-any': 'off',
    'ts/no-unused-vars': 'warn',
    // Framework code carries unused parameters by design — interface
    // contracts where the implementation doesn't need every argument.
    // Surface them as warnings rather than blocking CI; the `^_` rename
    // dance isn't worth it across hundreds of stable signatures.
    'pickier/no-unused-vars': 'warn',
    'ts/no-top-level-await': 'off',
    'regexp/no-unused-capturing-group': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'style/brace-style': 'off',
    'style/max-statements-per-line': 'off',
    'markdown/heading-increment': 'error',
    'markdown/no-trailing-spaces': 'error',
    'markdown/fenced-code-language': 'warn',
    'markdown/no-inline-html': 'off',
    'markdown/reference-links-images': 'off',
    'markdown/single-title': 'off',
    'markdown/blanks-around-fences': 'off',
    'markdown/no-duplicate-heading': 'off',
    'markdown/single-trailing-newline': 'off',
    'markdown/link-image-style': 'off',
  },
}

export default config
