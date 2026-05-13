CREATE TABLE IF NOT EXISTS "payment_products" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "description" TEXT,
  "key" TEXT,
  "unit_price" INTEGER,
  "status" TEXT,
  "image" TEXT,
  "provider_id" INTEGER,
  "uuid" TEXT
);