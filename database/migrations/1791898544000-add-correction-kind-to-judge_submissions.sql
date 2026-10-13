-- Let `judge_submissions` carry corrections as well as new-judge suggestions
-- (bench-review#50).
--
-- The FAQ has been promising a "Suggest an edit" link on every judge profile
-- since launch, and that link exists on no component — the one correction
-- channel the site advertises goes nowhere. The contact form's "Judge data
-- correction" option posts to /api/contact, which has no route either.
--
-- Reusing this table rather than adding one: a correction needs exactly what a
-- suggestion needs (what is wrong, a source, who is reporting, a moderation
-- status) and there is already a working queue, a reviewer action and a
-- moderator notification wired to it. A second table would mean a second queue
-- nobody watches, which is how the first dead channel happened.
--
-- `kind` defaults to 'new' so every existing row keeps its meaning.
-- `judge_id` is what makes a correction actionable: the whole failure of the
-- contact-form route was that a report arrived with no way to tell which of
-- 2,740 profiles it was about.

ALTER TABLE "judge_submissions" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "judge_submissions" ADD COLUMN "judge_id" INTEGER REFERENCES "judges"("id");
-- A correction's free text. `bio` already means "the biography this person
-- submitted for a new judge"; reusing it for "what is wrong with this profile"
-- would make the admin queue render one field with two meanings.
ALTER TABLE "judge_submissions" ADD COLUMN "details" TEXT;

CREATE INDEX IF NOT EXISTS "idx_judge_submissions_kind" ON "judge_submissions" ("kind");
CREATE INDEX IF NOT EXISTS "idx_judge_submissions_judge_id" ON "judge_submissions" ("judge_id");
