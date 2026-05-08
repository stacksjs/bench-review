CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "content" TEXT,
  "platform" TEXT CHECK ("platform" IN ('twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube')),
  "status" TEXT CHECK ("status" IN ('draft', 'scheduled', 'published', 'failed')) default 'draft',
  "scheduled_at" TEXT,
  "published_at" TEXT,
  "likes" INTEGER default 0,
  "shares" INTEGER default 0,
  "comments" INTEGER default 0,
  "reach" INTEGER default 0,
  "image_url" TEXT,
  "external_id" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);