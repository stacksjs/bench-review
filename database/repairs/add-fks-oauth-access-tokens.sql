-- Add the declared foreign keys to "oauth_access_tokens" (1 rows).
--
--   oauth_access_tokens.user_id -> users.id
--   oauth_access_tokens.oauth_client_id -> oauth_clients.id
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

-- 1 row(s) here point at a users row that does not exist, so
-- the constraint cannot be applied while they remain. They are stale: the
-- "users" table is empty, so these reference a row that was removed or
-- never existed. Deleted rather than repointed -- there is nothing to point
-- them at. PRAGMA foreign_key_check could not see this before now, because it
-- only checks constraints that already exist.
DELETE FROM "oauth_access_tokens" WHERE "user_id" IS NOT NULL
  AND "user_id" NOT IN (SELECT id FROM "users");

CREATE TABLE "oauth_access_tokens_fk_tmp" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES "users"("id") NOT NULL,
        oauth_client_id INTEGER REFERENCES "oauth_clients"("id") NOT NULL,
        token TEXT NOT NULL,
        name VARCHAR(255),
        scopes TEXT,
        revoked BOOLEAN NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        -- What the browser called itself and where it came from, so a person
        -- can recognise their own sessions well enough to revoke one. Null for
        -- a token minted by a script, which has neither.
        user_agent VARCHAR(255),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      );

INSERT INTO "oauth_access_tokens_fk_tmp" ("id","user_id","oauth_client_id","token","name","scopes","revoked","expires_at","user_agent","ip_address","created_at","updated_at")
  SELECT "id","user_id","oauth_client_id","token","name","scopes","revoked","expires_at","user_agent","ip_address","created_at","updated_at" FROM "oauth_access_tokens";

DROP TABLE "oauth_access_tokens";
ALTER TABLE "oauth_access_tokens_fk_tmp" RENAME TO "oauth_access_tokens";

CREATE INDEX idx_oauth_access_tokens_token ON oauth_access_tokens(token);

PRAGMA foreign_keys=ON;
