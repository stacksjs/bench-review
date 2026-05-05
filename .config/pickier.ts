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
  ],
  lint: {
    extensions: ['ts', 'js', 'md'],
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
