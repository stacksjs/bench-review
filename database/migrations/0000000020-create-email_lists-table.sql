CREATE TABLE IF NOT EXISTS "email_lists" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "slug" TEXT,
  "description" TEXT,
  "subscriber_count" INTEGER default 0,
  "active_count" INTEGER default 0,
  "unsubscribed_count" INTEGER default 0,
  "bounced_count" INTEGER default 0,
  "status" TEXT CHECK ("status" IN ('active', 'inactive', 'archived')) default 'active',
  "is_public" INTEGER default 1,
  "double_opt_in" INTEGER default 1,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);