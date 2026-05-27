-- bench-review#37 — self-declared credential claim + verification.
--
-- Six new columns on users:
--
--   credential_type            — TEXT, NULL by default. Self-declared
--                                role classification claim. One of:
--                                'bar_admission' / 'clerk_position' /
--                                'court_staff' / 'judicial_appointment'.
--   credential_state           — TEXT, NULL by default. Two-letter
--                                state code or "FEDERAL" for federal-
--                                level credentials.
--   credential_claimed_at      — TEXT timestamp when the user first
--                                submitted the claim. Sets the queue
--                                ordering for admins.
--   credential_verified_at     — TEXT timestamp when an admin approved
--                                the claim. NULL means unverified.
--   credential_verified_by_user_id — INTEGER, the admin who clicked
--                                approve. Audit trail.
--   credential_rejection_note  — TEXT, optional rejection reason if
--                                the admin rejects. Surfaced back to
--                                the user in /settings so they know
--                                what was wrong.
--
-- The actual proof image (bar card / clerk ID / court badge) is
-- deliberately out-of-band for this MVP — the platform tracks the
-- CLAIM, not the proof. Admins verify against external evidence
-- (email reply with a photo, video call, employer corroboration).
-- File upload + private storage land as a follow-up — see the
-- close comment on the issue for the rationale.
--
-- All columns NULLABLE so existing rows aren't forced into a
-- backfill before the user gets a chance to declare.

ALTER TABLE "users" ADD COLUMN "credential_type" TEXT;
ALTER TABLE "users" ADD COLUMN "credential_state" TEXT;
ALTER TABLE "users" ADD COLUMN "credential_claimed_at" TEXT;
ALTER TABLE "users" ADD COLUMN "credential_verified_at" TEXT;
ALTER TABLE "users" ADD COLUMN "credential_verified_by_user_id" INTEGER;
ALTER TABLE "users" ADD COLUMN "credential_rejection_note" TEXT;

CREATE INDEX IF NOT EXISTS "users_credential_status_idx"
  ON "users" ("credential_verified_at", "credential_claimed_at");
