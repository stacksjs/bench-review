import type { FeaturesConfig } from '@stacksjs/types'

/**
 * **Stacks Feature Bundles**
 *
 * Each entry below activates a framework feature bundle. A feature is only
 * loaded when its flag is `true` — apps that leave a flag `false` (or omit
 * it) pay nothing for that feature at boot. No eager model load, no
 * route flood, no action-import errors for things they don't ship.
 *
 * Manage this list with the install commands rather than editing directly:
 *
 *   ./buddy dashboard:install     # flips dashboard → true
 *   ./buddy commerce:install      # flips commerce → true
 *   ./buddy commerce:uninstall    # flips commerce → false
 *
 * Available features (see @stacksjs/types#StacksFeature for the full set):
 * core, auth, marketing, cms, commerce, dashboard, monitoring, realtime, queue.
 */
export default {
  core: true,
  auth: true,
} satisfies FeaturesConfig
