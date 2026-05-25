CREATE TABLE IF NOT EXISTS "releases" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "version" TEXT,
  "type" TEXT,
  "status" TEXT,
  "notes" TEXT,
  "downloads" INTEGER,
  "author" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);