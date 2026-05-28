CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "token" TEXT,
  "name" TEXT,
  "scopes" TEXT,
  "revoked" INTEGER,
  "expires_at" TEXT,
  "user_id" INTEGER,
  "oauth_client_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);