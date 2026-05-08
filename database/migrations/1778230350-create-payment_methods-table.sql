CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT,
  "last_four" INTEGER,
  "brand" TEXT,
  "exp_month" INTEGER,
  "exp_year" INTEGER,
  "is_default" INTEGER,
  "provider_id" INTEGER,
  "user_id" INTEGER,
  "uuid" TEXT
);