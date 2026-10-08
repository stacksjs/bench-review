-- Add the declared foreign keys to "personal_access_tokens" (0 rows).
--
--   personal_access_tokens.user_id -> users.id
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

CREATE TABLE "personal_access_tokens_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "token" TEXT,
  "plain_text_token" TEXT,
  "abilities" TEXT,
  "last_used_at" TEXT,
  "expires_at" TEXT,
  "revoked_at" TEXT,
  "ip_address" TEXT,
  "device_name" TEXT,
  "is_single_use" INTEGER,
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);

INSERT INTO "personal_access_tokens_fk_tmp" ("id","name","token","plain_text_token","abilities","last_used_at","expires_at","revoked_at","ip_address","device_name","is_single_use","user_id","created_at","updated_at")
  SELECT "id","name","token","plain_text_token","abilities","last_used_at","expires_at","revoked_at","ip_address","device_name","is_single_use","user_id","created_at","updated_at" FROM "personal_access_tokens";

DROP TABLE "personal_access_tokens";
ALTER TABLE "personal_access_tokens_fk_tmp" RENAME TO "personal_access_tokens";

CREATE UNIQUE INDEX "personal_access_tokens_token_unique" ON "personal_access_tokens" ("token");

PRAGMA foreign_keys=ON;
