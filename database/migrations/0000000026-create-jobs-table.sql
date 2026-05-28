CREATE TABLE IF NOT EXISTS "jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "queue" TEXT,
  "payload" TEXT,
  "attempts" INTEGER,
  "available_at" INTEGER,
  "reserved_at" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);