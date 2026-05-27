-- bench-review#31 — photos attached to reviews.
--
-- One row per uploaded image. The review_id links back to the
-- parent; user_id captures the uploader for ownership checks
-- (only the author can delete their photos before/after publish).
--
-- Three URL columns track the resize ladder:
--   thumb_url  — 200w, used in feed cards
--   card_url   — 800w, used in article hero gallery
--   full_url   — 1600w, used in lightbox-on-click
--
-- All three point at relative paths under `storage/uploads/review-
-- photos/<review-uuid>/<photo-uuid>.jpg` (or .webp). The actual
-- bytes-on-disk live in the local storage adapter at MVP; the URL
-- column is the rendering hint, not the storage primitive.
--
-- `order` controls gallery sequence (lowest first). Authors can
-- reorder by re-uploading; multi-photo reorder UI is a follow-up.
--
-- EXIF is stripped at upload time via stripMetadata() from
-- @stacksjs/storage — privacy gate is the action layer, not the
-- schema.

CREATE TABLE IF NOT EXISTS "review_photos" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "judge_review_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "thumb_url" TEXT NOT NULL,
  "card_url" TEXT NOT NULL,
  "full_url" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "review_photos_review_idx"
  ON "review_photos" ("judge_review_id", "order_index");
CREATE INDEX IF NOT EXISTS "review_photos_user_idx"
  ON "review_photos" ("user_id");
