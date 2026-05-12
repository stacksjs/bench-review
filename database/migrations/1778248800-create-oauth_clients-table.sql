CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "secret" TEXT,
  "provider" TEXT,
  "redirect" TEXT,
  "personal_access_client" INTEGER,
  "password_client" INTEGER,
  "revoked" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);