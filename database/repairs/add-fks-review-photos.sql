-- Add the declared foreign keys to "review_photos" (0 rows).
--
--   review_photos.judge_review_id -> judge_reviews.id
--   review_photos.user_id -> users.id
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

CREATE TABLE "review_photos_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "thumb_url" TEXT,
  "card_url" TEXT,
  "full_url" TEXT,
  "mime" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "order_index" INTEGER default 0,
  "judge_review_id" INTEGER REFERENCES "judge_reviews"("id"),
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "review_photos_fk_tmp" ("id","thumb_url","card_url","full_url","mime","width","height","order_index","judge_review_id","user_id","created_at","updated_at","uuid")
  SELECT "id","thumb_url","card_url","full_url","mime","width","height","order_index","judge_review_id","user_id","created_at","updated_at","uuid" FROM "review_photos";

DROP TABLE "review_photos";
ALTER TABLE "review_photos_fk_tmp" RENAME TO "review_photos";

CREATE INDEX "review_photos_review_photos_review_idx" ON "review_photos" ("judge_review_id", "order_index");
CREATE INDEX "review_photos_review_photos_user_idx" ON "review_photos" ("user_id");
CREATE UNIQUE INDEX "review_photos_uuid_unique" ON "review_photos" ("uuid");

PRAGMA foreign_keys=ON;
