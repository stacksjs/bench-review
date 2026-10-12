import type { CloudConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'
import security from './security'

/**
 * **Cloud**
 *
 * EMPTY ON PURPOSE. This file arrived as stock Stacks scaffolding and still
 * described somebody else's infrastructure: `stacksjs.org` as the root site
 * plus `docs.`, `tlsx.`, `dtsx.` and `spreadsheets.` subdomains, pointing at
 * paths like `../../tlsx/docs/dist` that do not exist in this repository.
 *
 * That is not inert. `./buddy deploy` reads this file, so running it would
 * have aimed an AWS serverless deployment at domains bench-review does not
 * own, from paths it does not have. DEPLOY.md has flagged it as outstanding
 * since it was written: "Either rewrite it for the chosen host or delete it;
 * do not assume `./buddy deploy` works."
 *
 * The host is not chosen yet (#85), so rewriting it would be inventing an
 * answer. Clearing `sites` means `./buddy deploy` has nothing to act on
 * instead of acting on the wrong thing.
 *
 * bench's actual deploy model is in DEPLOY.md and does not go through here:
 * production is the pre-rendered `dist/` plus the API, and stx is
 * build-time-only, so there is no publish step. Fill this in only if the
 * chosen host is one `./buddy deploy` actually drives.
 */
export default {
  sites: {},

  infrastructure: {
    type: 'serverless',
    driver: 'aws',
    firewall: security.firewall,
    environments: ['production', 'staging', 'development'],

    storage: {},

    api: {
      prefix: env.API_PREFIX || 'api',
      // version: 'v1',
      description: 'My awesome Stacks API',
      deploy: true,
      memorySize: 512,
      prewarm: 10,
      timeout: 30,
    },

    cdn: {
      compress: true,

      allowedMethods: 'ALL',
      cachedMethods: 'GET_HEAD',
      originShieldRegion: 'us-east-1',
      minTtl: 0,
      defaultTtl: 86400,
      maxTtl: 31536000,
      cookieBehavior: 'none',

      allowList: {
        cookies: [],
        headers: [],
        queryStrings: [],
      },

      realtimeLogs: {
        enabled: true,
        samplingRate: 1,
      },
    },

    fileSystem: true, // enables file system

    // compute: {},
    // queues: false,
    // queue-concurrency: 50
  },
} satisfies CloudConfig
