CREATE TABLE IF NOT EXISTS "campaign_sends" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "campaign_id" INTEGER,
  "subscriber_id" INTEGER,
  "email_list_id" INTEGER,
  "status" TEXT CHECK ("status" IN ('queued', 'sent', 'failed', 'bounced', 'complained')) default 'queued',
  "provider_message_id" INTEGER,
  "error" TEXT,
  "sent_at" TEXT,
  "opened_at" TEXT,
  "clicked_at" TEXT,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);