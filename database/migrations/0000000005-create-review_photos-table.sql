CREATE TABLE IF NOT EXISTS "review_photos" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "thumb_url" TEXT,
  "card_url" TEXT,
  "full_url" TEXT,
  "mime" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "order_index" INTEGER default 0,
  "judge_review_id" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);