CREATE TABLE IF NOT EXISTS "judge_opinions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "case_name" TEXT,
  "citation" TEXT,
  "decision_date" TEXT,
  "summary" TEXT,
  "outcome_label" TEXT,
  "source_url" TEXT,
  "source_provider" TEXT default 'manual',
  "external_id" INTEGER,
  "judge_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);