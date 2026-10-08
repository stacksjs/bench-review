-- Add the declared foreign keys to "payment_transactions" (0 rows).
--
--   payment_transactions.user_id -> users.id
--   payment_transactions.payment_method_id -> payment_methods.id
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

CREATE TABLE "payment_transactions_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "description" TEXT,
  "amount" INTEGER,
  "type" TEXT,
  "provider_id" INTEGER,
  "user_id" INTEGER REFERENCES "users"("id"),
  "payment_method_id" INTEGER REFERENCES "payment_methods"("id"),
  "uuid" TEXT
);

INSERT INTO "payment_transactions_fk_tmp" ("id","name","description","amount","type","provider_id","user_id","payment_method_id","uuid")
  SELECT "id","name","description","amount","type","provider_id","user_id","payment_method_id","uuid" FROM "payment_transactions";

DROP TABLE "payment_transactions";
ALTER TABLE "payment_transactions_fk_tmp" RENAME TO "payment_transactions";

CREATE UNIQUE INDEX "payment_transactions_uuid_unique" ON "payment_transactions" ("uuid");

PRAGMA foreign_keys=ON;
