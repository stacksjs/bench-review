CREATE TABLE IF NOT EXISTS "deployments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "commit_hash" TEXT,
  "commit_message" TEXT,
  "branch" TEXT,
  "status" TEXT,
  "environment" TEXT,
  "duration" INTEGER,
  "author" TEXT,
  "url" TEXT,
  "error_log" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);