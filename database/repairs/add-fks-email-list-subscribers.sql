-- Add the declared foreign keys to "email_list_subscribers" (0 rows).
--
--   email_list_subscribers.email_list_id -> email_lists.id
--   email_list_subscribers.subscriber_id -> subscribers.id
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

CREATE TABLE "email_list_subscribers_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email_list_id" INTEGER REFERENCES "email_lists"("id"),
  "subscriber_id" INTEGER REFERENCES "subscribers"("id"),
  "status" TEXT CHECK ("status" IN ('subscribed', 'unsubscribed', 'pending', 'bounced')) default 'subscribed',
  "source" TEXT default 'api',
  "subscribed_at" TEXT,
  "unsubscribed_at" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "email_list_subscribers_fk_tmp" ("id","email_list_id","subscriber_id","status","source","subscribed_at","unsubscribed_at","created_at","updated_at","uuid")
  SELECT "id","email_list_id","subscriber_id","status","source","subscribed_at","unsubscribed_at","created_at","updated_at","uuid" FROM "email_list_subscribers";

DROP TABLE "email_list_subscribers";
ALTER TABLE "email_list_subscribers_fk_tmp" RENAME TO "email_list_subscribers";

CREATE UNIQUE INDEX "email_list_subscribers_uuid_unique" ON "email_list_subscribers" ("uuid");

PRAGMA foreign_keys=ON;
