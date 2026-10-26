import type { CloudConfig as TsCloudConfig } from '@stacksjs/ts-cloud'
import type { CloudConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **Cloud** — bench-review
 *
 * Attach-mode Hetzner deploy. bench ships onto the shared
 * `stacks-production-app` box owned by the `stacks` project, alongside
 * hq.training and analyticshq (both resolve to 178.105.248.188, which is how
 * the box was identified without Hetzner credentials). The owner manages the
 * box, the rpx gateway on :80/:443 with on-demand TLS, the firewall and the
 * pantry Postgres on 127.0.0.1:5432.
 *
 * NOTHING HERE PROVISIONS ANYTHING. Attach mode resolves an existing server by
 * its Hetzner labels (ts-cloud/project=stacks, environment=production,
 * role=app) using HCLOUD_TOKEN. This deploy only ships bench's two sites,
 * writes bench's additive rpx fragment, creates bench's own systemd units and
 * reconciles bench's DNS.
 *
 * This file replaces stock AWS-serverless scaffolding that aimed at
 * stacksjs.org and paths this repository does not have. That file was emptied
 * deliberately because no host had been chosen; the host is chosen now.
 *
 * ## The deploy contract lives in preview.ts, not in rpx
 *
 * DEPLOY.md requires three things of any host: a REWRITE (not a redirect) of
 * /verify-email/:id/:token to verify-email.html, a same-origin /api/* proxy,
 * and shell rewrites for the dynamic routes that are not pre-rendered.
 * ts-cloud has no declarative rewrite for the rpx path — its rewrite support
 * is CloudFront-only — so these cannot be expressed as config.
 *
 * They do not need to be. preview.ts already implements all three (see
 * SHELL_REWRITES and the /api/ branch) and package.json already maps
 * "start" to it. So bench ships as a SERVER site that serves dist/ through
 * preview.ts, exactly as hq.training serves its stx views through its own Bun
 * server, rather than as a static site depending on gateway rules.
 *
 * The one behaviour that changes in production: rpx routes /api straight to
 * the API site below, so preview.ts's own proxy branch never fires. Same
 * origin either way, one hop fewer.
 *
 * ⚠️ DNS IS NOT WIRED YET. benchreview.org is registered at GoDaddy and its
 * nameservers still point at Netlify (dns{1..4}.p02.nsone.net) over an empty
 * zone, left from a deploy that failed in June 2025. Every sibling domain
 * sits on Porkbun nameservers, which is what makes their DNS "automatic" —
 * ts-cloud upserts the A record on deploy. Until bench's nameservers are
 * moved to ns.porkbun.com and the domain is added to the Porkbun account with
 * API access switched on for it, the dns block below has nothing to write to.
 *
 * @see DEPLOY.md for the full contract and the artifacts it applies to
 */
export const tsCloud: TsCloudConfig = {
  project: {
    name: 'bench-review',
    // The slug namespaces everything this tenant owns on the shared box:
    // install dirs under /var/www/bench-*, systemd units bench-*@<sha>, and
    // the rpx fragment. It must never equal attachTo.
    slug: 'bench',
    region: 'us-east-1', // AWS-only; unused on Hetzner
  },

  // Attach to the shared box instead of provisioning one. Takes the OWNER
  // PROJECT'S SLUG, not a server name.
  cloud: {
    provider: 'hetzner',
    attachTo: 'stacks',
  },

  mode: 'server',

  environments: {
    production: {
      type: 'production',
      deployBranch: 'main',
      region: 'us-east-1',
      variables: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
    },
  },

  /**
   * Attach mode never provisions from this block. It records what a dedicated
   * bench box would look like, and carries the settings the attach path does
   * consume: the rpx/TLS proxy settings, the database declaration and DNS.
   */
  infrastructure: {
    compute: {
      instances: 1,
      size: 'small',
      disk: {
        size: 20,
        type: 'ssd',
        encrypted: true,
      },
      managedServices: { postgres: true },
      webServer: 'rpx',
      proxy: {
        engine: 'rpx',
        onDemandTls: true,
        onDemandTlsEmail: 'hello@benchreview.org',
      },
    },

    /**
     * ⚠️ UNVERIFIED CHOICE. bench runs sqlite today (.env) with a mysql
     * default in config/database.ts; its migrations have never been executed
     * against Postgres. Postgres is declared here because it is what the
     * shared box provides and what every sibling uses, but this should be
     * proven against a local Postgres before a first deploy.
     *
     * Reverting is small: drop this block and set DB_CONNECTION=sqlite in
     * .env.production.
     *
     * On the shared box the bench role and database are created once by hand
     * against the owner's pantry Postgres, as hq.training's were.
     */
    appDatabase: {
      engine: 'postgres',
      name: 'bench',
      username: 'bench',
      password: env.DB_PASSWORD,
    },

    /**
     * ts-cloud auto-detects the provider from the domain's nameservers and
     * reads PORKBUN_API_KEY / PORKBUN_SECRET_KEY from the environment to
     * upsert the A records. No hostedZoneId — that is Route53-only.
     */
    dns: {
      domain: env.APP_DOMAIN || 'benchreview.org',
    },
  },

  /**
   * Sites.
   *
   * ORDER MATTERS: the API is listed first so rpx routes /api to it rather
   * than handing the path to the site mounted at /.
   */
  sites: {
    // The bun-router API: auth, reviews, moderation, uploads. Mounted at /api
    // on the same host, which is what makes the stores' relative paths work —
    // every one of them calls /api/... with no origin.
    api: {
      root: '.',
      path: '/api',
      domain: env.APP_DOMAIN || 'benchreview.org',
      deploy: 'server',
      // app/ProductionApi.ts is the API-only entry: the framework's
      // storage/framework/api/dev.ts with its file watchers removed, routes
      // imported eagerly so a bad registry fails at boot instead of on the
      // first request, and SIGTERM handled so systemd can drain rather than
      // SIGKILL. './buddy serve' is NOT an alternative here: it proxies /api
      // rather than hosting it, so it presupposes this process.
      //
      // Verified booting on a spare port: answers /api/health with database
      // and cache probes passing.
      start: 'bun app/ProductionApi.ts',
      port: 3035,
      // Owned health endpoint rather than a route that happens to answer.
      healthCheck: { path: '/api/health' },
      env: { HOST: '127.0.0.1', APP_ENV: 'production', NODE_ENV: 'production' },
      preStart: [
        'bun install --frozen-lockfile',
        // Verified present in ./buddy --help. There is no 'migrate' script in
        // package.json, so the framework command is the only one that exists.
        './buddy migrate',
      ],
      // Uploads must outlive a release. storage/app is where the disk facade
      // in app/Storage/disk.ts writes when FILESYSTEM_DISK=local.
      sharedPaths: ['storage/app', 'storage/logs'],
    },

    // The pre-rendered site, served through preview.ts, which carries the
    // verify-email rewrite and the dynamic-route shells.
    main: {
      root: '.',
      path: '/',
      domain: env.APP_DOMAIN || 'benchreview.org',
      deploy: 'server',
      // Local Xcode products and agent scratch are not part of a release.
      exclude: ['build', '.claude', '.agents', 'storage/framework/mobile', 'storage/logs', 'storage/app'],
      // The port argument is positional: preview.ts reads process.argv[2].
      start: 'bun preview.ts 3034',
      port: 3034,
      healthCheck: { path: '/' },
      // APP_URL must be the production origin at BUILD time, not just at run
      // time: the SSG bakes canonicals, OG tags and the sitemap from it, and
      // the conformance gate checks them.
      build: 'APP_URL=https://benchreview.org bun run build',
      env: { HOST: '127.0.0.1', APP_ENV: 'production', NODE_ENV: 'production' },
    },

    // www is the alias and the apex is canonical, deliberately. config/mobile.ts
    // names the bare apex in trustedOrigins and in
    // associatedDomains: ['applinks:benchreview.org'], and site.config.ts sets
    // url to https://benchreview.org. Universal links match the apex exactly,
    // so reversing these two silently breaks every universal link while the
    // site itself still looks correct.
    www: {
      domain: `www.${env.APP_DOMAIN || 'benchreview.org'}`,
      redirect: `https://${env.APP_DOMAIN || 'benchreview.org'}`,
    },
  },
}

// Stacks' own cloud configuration. Empty: bench's deploy goes through ts-cloud
// above, and the AWS serverless features this type describes are not in use.
const config: CloudConfig = {}

export default config
