-- bench-review#26 — server-side compose-draft autosave.
--
-- One row per user. A user only has one draft-in-progress at a time
-- (matches the localStorage behaviour the editor has today). When
-- the user submits the review the draft row gets cleared; when they
-- come back to /review (potentially on a different device), the
-- draft is restored from the server.
--
-- judge_id NULLABLE so users can stash a draft before picking a
-- judge — matches the localStorage shape, which also stores
-- judge-less drafts.
--
-- rating / type can be NULL too — the editor stores partial state
-- (just title + content, no rating yet) commonly.

CREATE TABLE IF NOT EXISTS "review_drafts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "judge_id" INTEGER,
  "title" TEXT,
  "content" TEXT,
  "rating" INTEGER,
  "type" TEXT,
  "anonymized" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT
);

-- One draft per user — the PUT endpoint upserts on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "review_drafts_user_unique"
  ON "review_drafts" ("user_id");
