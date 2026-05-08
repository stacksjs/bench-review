CREATE TABLE IF NOT EXISTS "activities" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT,
  "description" TEXT,
  "subject_type" TEXT,
  "subject_id" INTEGER,
  "causer" TEXT,
  "properties" TEXT,
  "ip_address" TEXT,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);