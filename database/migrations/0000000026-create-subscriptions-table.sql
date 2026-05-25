CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT,
  "plan" TEXT,
  "provider_id" INTEGER,
  "provider_status" TEXT,
  "unit_price" INTEGER,
  "provider_type" TEXT,
  "provider_price_id" INTEGER,
  "quantity" INTEGER,
  "trial_ends_at" TEXT,
  "ends_at" TEXT,
  "last_used_at" TEXT,
  "user_id" INTEGER,
  "uuid" TEXT
);