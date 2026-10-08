-- Add the declared foreign keys to "subscriptions" (0 rows).
--
--   subscriptions.user_id -> users.id
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

CREATE TABLE "subscriptions_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT,
  "plan" TEXT,
  "provider_id" INTEGER,
  "provider_status" TEXT,
  "unit_price" INTEGER,
  "provider_type" TEXT,
  "provider_price_id" INTEGER,
  "quantity" INTEGER,
  "trial_ends_at" TEXT,
  "ends_at" TEXT,
  "last_used_at" TEXT,
  "user_id" INTEGER REFERENCES "users"("id"),
  "uuid" TEXT
);

INSERT INTO "subscriptions_fk_tmp" ("id","type","plan","provider_id","provider_status","unit_price","provider_type","provider_price_id","quantity","trial_ends_at","ends_at","last_used_at","user_id","uuid")
  SELECT "id","type","plan","provider_id","provider_status","unit_price","provider_type","provider_price_id","quantity","trial_ends_at","ends_at","last_used_at","user_id","uuid" FROM "subscriptions";

DROP TABLE "subscriptions";
ALTER TABLE "subscriptions_fk_tmp" RENAME TO "subscriptions";

CREATE UNIQUE INDEX "subscriptions_provider_id_unique" ON "subscriptions" ("provider_id");
CREATE UNIQUE INDEX "subscriptions_uuid_unique" ON "subscriptions" ("uuid");

PRAGMA foreign_keys=ON;
