CREATE TABLE IF NOT EXISTS "judge_search_queries" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "query" TEXT NOT NULL,
  "searches" INTEGER NOT NULL DEFAULT 1,
  "last_result_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  UNIQUE ("query")
);
