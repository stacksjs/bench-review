CREATE TABLE IF NOT EXISTS "user_permissions" (
  "user_id" INTEGER NOT NULL,
  "permission_id" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "permission_id")
);
