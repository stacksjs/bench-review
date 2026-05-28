CREATE TABLE IF NOT EXISTS "subscribers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email" TEXT,
  "status" TEXT CHECK ("status" IN ('subscribed', 'unsubscribed', 'pending', 'bounced')) default 'subscribed',
  "source" TEXT default 'homepage',
  "unsubscribed_at" TEXT,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);