-- Record that a person actually agreed to the Terms (bench-review#54).
--
-- Until now the site relied on browsewrap: terms.stx asserts that using the
-- site constitutes agreement, and nothing in the signup flow ever asked.
-- Courts routinely decline to enforce browsewrap, and the clauses that matter
-- most here live in that document — the content licence, the content
-- standards, the liability cap and the 18+ requirement. A site inviting the
-- public to rate named, sitting judges is the wrong place to discover that
-- none of them bind anyone.
--
-- Nullable on purpose. Existing accounts predate the checkbox and stamping
-- them would be a lie about what those people were shown; `NULL` means "never
-- asked", which is the truth and is also the state a re-consent prompt would
-- need to find them by.
--
-- The timestamp, not a boolean: what matters in a dispute is WHEN they agreed,
-- because the Terms change.

ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TEXT;
