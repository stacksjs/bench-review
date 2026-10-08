-- Add the declared foreign keys to "subscribers" (0 rows).
--
--   subscribers.user_id -> users.id
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

CREATE TABLE "subscribers_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email" TEXT,
  "status" TEXT CHECK ("status" IN ('subscribed', 'unsubscribed', 'pending', 'bounced')) default 'subscribed',
  "source" TEXT default 'homepage',
  "unsubscribed_at" TEXT,
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "subscribers_fk_tmp" ("id","email","status","source","unsubscribed_at","user_id","created_at","updated_at","uuid")
  SELECT "id","email","status","source","unsubscribed_at","user_id","created_at","updated_at","uuid" FROM "subscribers";

DROP TABLE "subscribers";
ALTER TABLE "subscribers_fk_tmp" RENAME TO "subscribers";

CREATE UNIQUE INDEX "subscribers_email_unique" ON "subscribers" ("email");
CREATE UNIQUE INDEX "subscribers_uuid_unique" ON "subscribers" ("uuid");

PRAGMA foreign_keys=ON;
