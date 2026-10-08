-- Add the declared foreign keys to "judges" (2740 rows).
--
--   judges.court_house_id -> court_houses.id
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

CREATE TABLE "judges_fk_tmp" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "image_url" TEXT,
  "practice_area" TEXT CHECK ("practice_area" IN ('criminal', 'civil', 'family', 'probate', 'appellate', 'bankruptcy', 'other')),
  "court_house_id" INTEGER REFERENCES "court_houses"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
, "education" TEXT);

INSERT INTO "judges_fk_tmp" ("id","name","image_url","practice_area","court_house_id","created_at","updated_at","uuid","education")
  SELECT "id","name","image_url","practice_area","court_house_id","created_at","updated_at","uuid","education" FROM "judges";

DROP TABLE "judges";
ALTER TABLE "judges_fk_tmp" RENAME TO "judges";

CREATE INDEX "judges_judges_name_index" ON "judges" ("name");
CREATE UNIQUE INDEX "judges_uuid_unique" ON "judges" ("uuid");

PRAGMA foreign_keys=ON;
