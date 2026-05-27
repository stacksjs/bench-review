import type { SearchEngineConfig } from '@stacksjs/types'

/**
 * **Search Engine Options**
 *
 * This configuration defines all of your search engine options. Because Stacks is fully-typed,
 * you may hover any of the options below and the definitions will be provided. In case
 * you have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  // Driver pinned to meilisearch (bench-review#41). The prior
  // 'opensearch' default was a leftover from the Stacks scaffold —
  // never matched the infrastructure (Meilisearch is what's
  // actually listening on 127.0.0.1:7700). The search-engine driver
  // dispatcher at storage/framework/core/search-engine/src/index.ts
  // reads `searchEngine.driver` directly with no env-var fallback,
  // so this property is the single source of truth.
  driver: 'meilisearch',
} satisfies SearchEngineConfig
