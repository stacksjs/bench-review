-- Add the declared foreign keys to "judge_opinions" (0 rows).
--
--   judge_opinions.judge_id -> judges.id
--
-- SQLite cannot ALTER TABLE ADD CONSTRAINT, so the table is rebuilt: create
-- with the constraint, copy, drop, rename, recreate indexes. The CREATE below
-- is the LIVE definition with REFERENCES added inline -- not regenerated from
-- the model -- so column types, defaults and CHECKs are preserved byte for
-- byte and this migration changes nothing but the constraint.
--
-- No BEGIN/COMMIT: the runner supplies the transaction, and a nested one
-- errors (see auto-misc.sql).

PRAGMA foreign_keys=OFF;

CREATE TABLE "judge_opinions_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "case_name" TEXT,
  "citation" TEXT,
  "decision_date" TEXT,
  "summary" TEXT,
  "outcome_label" TEXT,
  "source_url" TEXT,
  "source_provider" TEXT default 'manual',
  "external_id" INTEGER,
  "judge_id" INTEGER REFERENCES "judges"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

INSERT INTO "judge_opinions_fk_tmp" ("id","case_name","citation","decision_date","summary","outcome_label","source_url","source_provider","external_id","judge_id","created_at","updated_at","uuid")
  SELECT "id","case_name","citation","decision_date","summary","outcome_label","source_url","source_provider","external_id","judge_id","created_at","updated_at","uuid" FROM "judge_opinions";

DROP TABLE "judge_opinions";
ALTER TABLE "judge_opinions_fk_tmp" RENAME TO "judge_opinions";

CREATE INDEX "judge_opinions_judge_opinions_judge_date_idx" ON "judge_opinions" ("judge_id", "decision_date");
CREATE UNIQUE INDEX "judge_opinions_uuid_unique" ON "judge_opinions" ("uuid");

PRAGMA foreign_keys=ON;
