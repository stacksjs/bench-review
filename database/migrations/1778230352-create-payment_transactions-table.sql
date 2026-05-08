CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "description" TEXT,
  "amount" INTEGER,
  "type" TEXT,
  "provider_id" INTEGER,
  "user_id" INTEGER,
  "payment_method_id" INTEGER,
  "uuid" TEXT
);