/**
 * ts-analytics App ID for this site.
 *
 * Create a site in your ts-analytics dashboard, copy its App ID (a short random
 * string like `WOLZMJDL`), and paste it below. This single value feeds both the
 * dev/serve config (`stx.config.ts`) and the static build (`build.ts`), so
 * there's exactly one place to change it.
 *
 * The API endpoint is baked into the integration — override per-deploy with the
 * `TS_ANALYTICS_ENDPOINT` env var if a deploy needs a non-default host.
 */
export const TS_ANALYTICS_APP_ID = 'B65FUT7V'
