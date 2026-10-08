-- Add the declared foreign keys to "judge_reviews" (0 rows).
--
--   judge_reviews.judge_id -> judges.id
--   judge_reviews.user_id -> users.id
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

CREATE TABLE "judge_reviews_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "title" TEXT,
  "content" TEXT,
  "rating" INTEGER,
  "comments" INTEGER,
  "type" TEXT,
  "status" TEXT,
  "anonymized" INTEGER default 0,
  "judge_id" INTEGER REFERENCES "judges"("id"),
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "judge_reviews_fk_tmp" ("id","title","content","rating","comments","type","status","anonymized","judge_id","user_id","created_at","updated_at","uuid")
  SELECT "id","title","content","rating","comments","type","status","anonymized","judge_id","user_id","created_at","updated_at","uuid" FROM "judge_reviews";

DROP TABLE "judge_reviews";
ALTER TABLE "judge_reviews_fk_tmp" RENAME TO "judge_reviews";

CREATE INDEX "judge_reviews_judge_reviews_title_index" ON "judge_reviews" ("title");
CREATE INDEX "judge_reviews_judge_reviews_anonymized_idx" ON "judge_reviews" ("anonymized");
CREATE INDEX "judge_reviews_judge_status_created_idx" ON "judge_reviews" ("judge_id", "status", "created_at");
CREATE INDEX "judge_reviews_status_created_idx" ON "judge_reviews" ("status", "created_at");
CREATE INDEX "judge_reviews_user_idx" ON "judge_reviews" ("user_id");
CREATE UNIQUE INDEX "judge_reviews_user_judge_unique" ON "judge_reviews" ("user_id", "judge_id") WHERE "status" != 'rejected' AND "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "judge_reviews_uuid_unique" ON "judge_reviews" ("uuid");

PRAGMA foreign_keys=ON;
