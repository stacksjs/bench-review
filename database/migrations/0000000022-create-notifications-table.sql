CREATE TABLE IF NOT EXISTS "notifications" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT CHECK ("type" IN ('email', 'sms', 'push', 'slack', 'webhook')),
  "channel" TEXT,
  "recipient" TEXT,
  "subject" TEXT,
  "body" TEXT,
  "status" TEXT CHECK ("status" IN ('pending', 'sent', 'delivered', 'failed', 'read')) default 'pending',
  "read_at" TEXT,
  "sent_at" TEXT,
  "metadata" TEXT,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);