-- Add the declared foreign keys to "review_comments" (0 rows).
--
--   review_comments.judge_review_id -> judge_reviews.id
--   review_comments.user_id -> users.id
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

CREATE TABLE "review_comments_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "body" TEXT,
  "anonymized" INTEGER default 0,
  "status" TEXT default 'published',
  "judge_review_id" INTEGER REFERENCES "judge_reviews"("id"),
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "review_comments_fk_tmp" ("id","body","anonymized","status","judge_review_id","user_id","created_at","updated_at","uuid")
  SELECT "id","body","anonymized","status","judge_review_id","user_id","created_at","updated_at","uuid" FROM "review_comments";

DROP TABLE "review_comments";
ALTER TABLE "review_comments_fk_tmp" RENAME TO "review_comments";

CREATE INDEX "review_comments_review_comments_review_status_idx" ON "review_comments" ("judge_review_id", "status");
CREATE INDEX "review_comments_review_comments_user_idx" ON "review_comments" ("user_id");
CREATE UNIQUE INDEX "review_comments_uuid_unique" ON "review_comments" ("uuid");

PRAGMA foreign_keys=ON;
