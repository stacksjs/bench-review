-- The contact form's messages (bench-review#54).
--
-- contact.stx has always POSTed to `/api/contact`, and that route has never
-- existed: the framework default mounts only when `feature('dashboard')` is
-- on, and config/features.ts enables core + auth. Every submission failed.
--
-- That matters more than a broken form usually does, because this is the
-- channel the site designates for "Report a review" and "Legal request". A
-- judge's counsel sending a takedown demand got a failure, and nothing
-- anywhere recorded that they had tried.
--
-- Stored as well as emailed, deliberately. Mail is best-effort and SMTP is on
-- the critical path for this app; a legal demand that exists only as an email
-- nobody received is the same as one never sent. The row is the record that it
-- arrived and when.
--
-- No IP address column. The useful thing about a legal request is its content,
-- and retaining network identifiers for everyone who fills in a contact form
-- is a liability rather than an asset.

CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  -- general | report | data | press | partnership | legal
  "topic" TEXT NOT NULL DEFAULT 'general',
  "message" TEXT NOT NULL,
  -- open | handled. Deliberately not a moderation status: this is an inbox.
  "status" TEXT NOT NULL DEFAULT 'open',
  "handled_at" TEXT,
  "handled_by_user_id" INTEGER REFERENCES "users"("id"),
  "uuid" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_contact_messages_topic" ON "contact_messages" ("topic");
CREATE INDEX IF NOT EXISTS "idx_contact_messages_status_created" ON "contact_messages" ("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "contact_messages_uuid_unique" ON "contact_messages" ("uuid") WHERE "uuid" IS NOT NULL;
