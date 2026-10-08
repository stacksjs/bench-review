-- Add the declared foreign keys to "social_posts" (0 rows).
--
--   social_posts.user_id -> users.id
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

CREATE TABLE "social_posts_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "content" TEXT,
  "platform" TEXT CHECK ("platform" IN ('twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube')),
  "status" TEXT CHECK ("status" IN ('draft', 'scheduled', 'published', 'failed')) default 'draft',
  "scheduled_at" TEXT,
  "published_at" TEXT,
  "likes" INTEGER default 0,
  "shares" INTEGER default 0,
  "comments" INTEGER default 0,
  "reach" INTEGER default 0,
  "image_url" TEXT,
  "external_id" INTEGER,
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "social_posts_fk_tmp" ("id","content","platform","status","scheduled_at","published_at","likes","shares","comments","reach","image_url","external_id","user_id","created_at","updated_at","uuid")
  SELECT "id","content","platform","status","scheduled_at","published_at","likes","shares","comments","reach","image_url","external_id","user_id","created_at","updated_at","uuid" FROM "social_posts";

DROP TABLE "social_posts";
ALTER TABLE "social_posts_fk_tmp" RENAME TO "social_posts";

CREATE UNIQUE INDEX "social_posts_uuid_unique" ON "social_posts" ("uuid");

PRAGMA foreign_keys=ON;
