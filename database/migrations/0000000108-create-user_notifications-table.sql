-- In-app social notifications. Distinct from the framework's existing
-- `notifications` table, which is for outbound system messages
-- (email/sms/push). This table powers the bell-icon feed: "someone
-- liked your review", "your review was approved", etc.
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Recipient. The user who SEES this notification in their feed.
  "user_id" INTEGER NOT NULL,
  -- Actor. The user who triggered the event (liker, admin who
  -- moderated). Nullable for system-issued notifications with no
  -- human actor.
  "actor_user_id" INTEGER,
  -- Event type. 'like' (someone liked your review),
  -- 'approved' (admin published your pending review),
  -- 'rejected' (admin declined your pending review).
  -- New types append-only; UI ignores unknown types defensively.
  "type" TEXT NOT NULL,
  -- The review the event relates to. Nullable so future generic
  -- notifications (e.g. system announcements) don't require a row
  -- shape change.
  "review_id" INTEGER,
  -- NULL = unread. We don't store a separate boolean.
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- "My notifications" feed: user_id + created_at DESC.
CREATE INDEX IF NOT EXISTS "user_notifications_user_id_created_at_idx"
  ON "user_notifications" ("user_id", "created_at");

-- "My unread count" — frequent header query, gated on read_at IS NULL.
CREATE INDEX IF NOT EXISTS "user_notifications_user_id_read_at_idx"
  ON "user_notifications" ("user_id", "read_at");
