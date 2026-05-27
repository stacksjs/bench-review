-- bench-review#39 — recent rulings / public docket integration.
--
-- Architectural foundation only at this stage. The issue is explicitly
-- parked on automated external integration (PACER costs, state-by-
-- state patchwork, legal-publishing data-use review). This schema +
-- the actions / UI on top let bench-review surface curated opinions
-- TODAY via admin entry, then plug an automated provider in later
-- without touching the render surface.
--
-- The columns map to the standard opinion shape across CourtListener,
-- PACER, and most state docket APIs:
--
--   judge_id           — local FK
--   case_name          — "Smith v. Jones" or equivalent
--   citation           — Bluebook-format or court-internal docket
--   decision_date      — when the opinion issued
--   summary            — moderator-written or external-fetched abstract
--   outcome_label      — affirmed / reversed / dismissed / etc.
--                         loose taxonomy, optional
--   source_url         — link out to the official source
--   source_provider    — 'manual', 'courtlistener', 'pacer',
--                         'state:CA', etc. Used by future automated
--                         refresh jobs to know which rows it owns
--                         vs which are admin-curated.
--   external_id        — unique id from the provider, used for the
--                         dedup-on-refresh check. NULL for manual entries.
--
-- Status field deliberately omitted at MVP — opinions either exist or
-- they don't (no draft / pending lifecycle yet). If automated fetching
-- lands later, add a `status` column then; for now everything visible
-- is admin-curated and trusted by construction.

CREATE TABLE IF NOT EXISTS "judge_opinions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "judge_id" INTEGER NOT NULL,
  "case_name" TEXT NOT NULL,
  "citation" TEXT,
  "decision_date" TEXT,
  "summary" TEXT,
  "outcome_label" TEXT,
  "source_url" TEXT,
  "source_provider" TEXT NOT NULL DEFAULT 'manual',
  "external_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT
);

CREATE INDEX IF NOT EXISTS "judge_opinions_judge_date_idx"
  ON "judge_opinions" ("judge_id", "decision_date" DESC);

-- Unique on (source_provider, external_id) for the dedup-on-refresh
-- check when an automated pipeline lands. NULL external_id is allowed
-- so multiple manual entries don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "judge_opinions_provider_external_unique"
  ON "judge_opinions" ("source_provider", "external_id")
  WHERE "external_id" IS NOT NULL;
