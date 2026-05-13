CREATE TABLE IF NOT EXISTS "email_subscriptions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "deleted_at" TEXT
);