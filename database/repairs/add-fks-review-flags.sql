-- Add the declared foreign keys to "review_flags" (0 rows).
--
--   review_flags.judge_review_id -> judge_reviews.id
--   review_flags.user_id -> users.id
--
-- SQLite cannot ALTER TABLE ADD CONSTRAINT, so the table is rebuilt: create
-- with the constraint, copy, drop, rename, recreate indexes. The CREATE below
-- is the LIVE definition with REFERENCES added inline -- not regenerated from
-- the model -- so column types, defaults and CHECKs are preserved byte for
-- byte and this migration changes nothing but the constraint.
--
-- No BEGIN/COMMIT: the runner supplies the transaction, and a nested one
-- errors (see auto-misc.sql).

PRAGMA foreign_keys=OFF;

CREATE TABLE "review_flags_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "reason" TEXT,
  "details" TEXT,
  "status" TEXT default 'open',
  "moderator_id" INTEGER,
  "moderator_note" TEXT,
  "judge_review_id" INTEGER REFERENCES "judge_reviews"("id"),
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "review_flags_fk_tmp" ("id","reason","details","status","moderator_id","moderator_note","judge_review_id","user_id","created_at","updated_at","uuid")
  SELECT "id","reason","details","status","moderator_id","moderator_note","judge_review_id","user_id","created_at","updated_at","uuid" FROM "review_flags";

DROP TABLE "review_flags";
ALTER TABLE "review_flags_fk_tmp" RENAME TO "review_flags";

CREATE INDEX "review_flags_review_flags_status_idx" ON "review_flags" ("status");
CREATE INDEX "review_flags_review_flags_review_idx" ON "review_flags" ("judge_review_id");
CREATE UNIQUE INDEX "review_flags_uuid_unique" ON "review_flags" ("uuid");

PRAGMA foreign_keys=ON;
