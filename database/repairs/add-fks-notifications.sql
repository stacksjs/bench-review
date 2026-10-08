-- Add the declared foreign keys to "notifications" (0 rows).
--
--   notifications.user_id -> users.id
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

CREATE TABLE "notifications_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT CHECK ("type" IN ('email', 'sms', 'push', 'slack', 'webhook')),
  "channel" TEXT,
  "recipient" TEXT,
  "subject" TEXT,
  "body" TEXT,
  "status" TEXT CHECK ("status" IN ('pending', 'sent', 'delivered', 'failed', 'read')) default 'pending',
  "read_at" TEXT,
  "sent_at" TEXT,
  "metadata" TEXT,
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "notifications_fk_tmp" ("id","type","channel","recipient","subject","body","status","read_at","sent_at","metadata","user_id","created_at","updated_at","uuid")
  SELECT "id","type","channel","recipient","subject","body","status","read_at","sent_at","metadata","user_id","created_at","updated_at","uuid" FROM "notifications";

DROP TABLE "notifications";
ALTER TABLE "notifications_fk_tmp" RENAME TO "notifications";

CREATE INDEX idx_notifications_user ON notifications (user_id);
CREATE UNIQUE INDEX "notifications_uuid_unique" ON "notifications" ("uuid");

PRAGMA foreign_keys=ON;
