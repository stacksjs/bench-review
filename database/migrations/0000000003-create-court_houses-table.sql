CREATE TABLE IF NOT EXISTS "court_houses" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "image" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zip_code" TEXT,
  "latitude" INTEGER,
  "longitude" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);