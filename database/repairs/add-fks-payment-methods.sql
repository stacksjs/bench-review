-- Add the declared foreign keys to "payment_methods" (0 rows).
--
--   payment_methods.user_id -> users.id
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

CREATE TABLE "payment_methods_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT,
  "last_four" INTEGER,
  "brand" TEXT,
  "exp_month" INTEGER,
  "exp_year" INTEGER,
  "is_default" INTEGER,
  "provider_id" INTEGER,
  "user_id" INTEGER REFERENCES "users"("id"),
  "uuid" TEXT
);

INSERT INTO "payment_methods_fk_tmp" ("id","type","last_four","brand","exp_month","exp_year","is_default","provider_id","user_id","uuid")
  SELECT "id","type","last_four","brand","exp_month","exp_year","is_default","provider_id","user_id","uuid" FROM "payment_methods";

DROP TABLE "payment_methods";
ALTER TABLE "payment_methods_fk_tmp" RENAME TO "payment_methods";

CREATE UNIQUE INDEX "payment_methods_uuid_unique" ON "payment_methods" ("uuid");

PRAGMA foreign_keys=ON;
