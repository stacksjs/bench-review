CREATE TABLE IF NOT EXISTS "users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "email" TEXT,
  "password" TEXT,
  "role_label" TEXT,
  "credential_type" TEXT,
  "credential_state" TEXT,
  "credential_claimed_at" TEXT,
  "credential_verified_at" TEXT,
  "credential_verified_by_user_id" INTEGER,
  "credential_rejection_note" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);