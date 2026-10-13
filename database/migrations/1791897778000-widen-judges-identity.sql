-- Identity and lifecycle fields on `judges` (bench-review#50).
--
-- The table held name, image_url, practice_area, court_house_id and education.
-- Nothing to tell two judges of the same name apart, no lifecycle, no stable
-- external identity, and no slug — on a site whose profile records are
-- first-party data about named people, that is an accuracy problem before it
-- is a product one.
--
-- ── What is backfilled here, and what is deliberately left NULL ────────
-- Only what can be derived without inventing anything:
--
--   state   — copied from the judge's courthouse, which already has it
--   status  — 'active' for every existing row, which is TRUE rather than a
--             convenient default: scripts/ingest-courtlistener.ts skips any
--             position with a date_termination and any deceased person, so
--             every one of the 2,740 imported rows is a sitting judge, as are
--             the 8 hand-seeded ones
--   slug    — derived from the name, deduped below
--
-- jurisdiction, external_id, bio and appointed_year stay NULL. They are
-- knowable but not from data already in this database:
--
--   jurisdiction — every CourtListener court this app ingests is federal, so
--                  it is tempting to set 'federal' across the board. The 8
--                  hand-seeded judges sit in California state courts, and
--                  nothing in SQL distinguishes a seeded courthouse from an
--                  ingested one. Guessing would put a false jurisdiction on a
--                  real judge's profile. The ingest script sets it on its next
--                  run; admin edit covers the rest.
--   external_id  — the CourtListener person id, which the ingest script now
--                  records. It turns re-identification from name-matching into
--                  an exact key.

ALTER TABLE "judges" ADD COLUMN "jurisdiction" TEXT;
ALTER TABLE "judges" ADD COLUMN "state" TEXT;
ALTER TABLE "judges" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "judges" ADD COLUMN "external_id" TEXT;
ALTER TABLE "judges" ADD COLUMN "bio" TEXT;
ALTER TABLE "judges" ADD COLUMN "appointed_year" INTEGER;
ALTER TABLE "judges" ADD COLUMN "slug" TEXT;

-- State from the courthouse the judge sits in.
UPDATE "judges"
   SET "state" = (SELECT "state" FROM "court_houses" WHERE "court_houses"."id" = "judges"."court_house_id")
 WHERE "state" IS NULL;

-- Slug from the name: lowercase, punctuation dropped, spaces to hyphens.
-- SQLite has no regex, so this is the specific set of characters that actually
-- occur in judge names here - periods (initials, Jr.), commas, apostrophes
-- (O'Brien), and quotes.
UPDATE "judges"
   SET "slug" = trim(replace(replace(replace(replace(replace(replace(
                  lower("name"),
                  '.', ''), ',', ''), '''', ''), '"', ''), '  ', ' '), ' ', '-'), '-')
 WHERE "slug" IS NULL;

-- Same-name judges exist and are the whole reason this issue was filed, so the
-- base slug collides. Everything after the first row of a colliding group gets
-- its id appended, which is stable and unique by construction.
UPDATE "judges"
   SET "slug" = "slug" || '-' || "id"
 WHERE "id" NOT IN (SELECT MIN("id") FROM "judges" GROUP BY "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "judges_slug_unique" ON "judges" ("slug") WHERE "slug" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "judges_external_id_unique" ON "judges" ("external_id") WHERE "external_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_judges_status" ON "judges" ("status");
