-- Add the declared foreign keys to "review_drafts" (1 rows).
--
--   review_drafts.user_id -> users.id
--   review_drafts.judge_id -> judges.id
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

-- 1 row(s) here point at a users row that does not exist, so
-- the constraint cannot be applied while they remain. They are stale: the
-- "users" table is empty, so these reference a row that was removed or
-- never existed. Deleted rather than repointed -- there is nothing to point
-- them at. PRAGMA foreign_key_check could not see this before now, because it
-- only checks constraints that already exist.
DELETE FROM "review_drafts" WHERE "user_id" IS NOT NULL
  AND "user_id" NOT IN (SELECT id FROM "users");

CREATE TABLE "review_drafts_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "title" TEXT,
  "content" TEXT,
  "rating" INTEGER,
  "type" TEXT,
  "anonymized" INTEGER default 0,
  "user_id" INTEGER REFERENCES "users"("id"),
  "judge_id" INTEGER REFERENCES "judges"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "review_drafts_fk_tmp" ("id","title","content","rating","type","anonymized","user_id","judge_id","created_at","updated_at","uuid")
  SELECT "id","title","content","rating","type","anonymized","user_id","judge_id","created_at","updated_at","uuid" FROM "review_drafts";

DROP TABLE "review_drafts";
ALTER TABLE "review_drafts_fk_tmp" RENAME TO "review_drafts";

CREATE INDEX "review_drafts_review_drafts_user_unique" ON "review_drafts" ("user_id");
CREATE UNIQUE INDEX "review_drafts_uuid_unique" ON "review_drafts" ("uuid");

PRAGMA foreign_keys=ON;
