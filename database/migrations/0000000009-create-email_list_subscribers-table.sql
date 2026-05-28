CREATE TABLE IF NOT EXISTS "email_list_subscribers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email_list_id" INTEGER,
  "subscriber_id" INTEGER,
  "status" TEXT CHECK ("status" IN ('subscribed', 'unsubscribed', 'pending', 'bounced')) default 'subscribed',
  "source" TEXT default 'api',
  "subscribed_at" TEXT,
  "unsubscribed_at" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);