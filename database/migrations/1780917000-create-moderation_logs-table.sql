CREATE TABLE IF NOT EXISTS "moderation_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "actor_user_id" INTEGER,
  "action" TEXT,
  "target_type" TEXT,
  "target_id" INTEGER,
  "note" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);