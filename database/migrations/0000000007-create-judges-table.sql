CREATE TABLE IF NOT EXISTS "judges" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "image_url" TEXT,
  "practice_area" TEXT CHECK ("practice_area" IN ('criminal', 'civil', 'family', 'probate', 'appellate', 'bankruptcy', 'other')),
  "court_house_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);