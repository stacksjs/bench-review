-- Second-factor codes for admin login (bench-review#56).
--
-- The admin panel is the de-anonymization surface on this site: it is where a
-- moderator can see who wrote an anonymous review of a named judge. Until now
-- it was reachable with an email and a password and nothing else, which means
-- one phished or reused password was the whole control.
--
-- So an admin password now only buys a challenge. The code is emailed to the
-- address on the account and has to come back before any token is issued.
--
-- Why a table of our own rather than `two_factor_challenges`: that table is
-- `{id, user_id, expires_at}` and is consumed by delete-on-read, which is
-- right for TOTP (where the code lives in the authenticator app) and wrong
-- here. An emailed code has to be STORED to be checked, and a wrong attempt
-- must cost an attempt rather than burning the challenge — otherwise one
-- typo means a new email, and five typos mean five emails.
--
-- `code_hash`, not the code. A 6-digit secret in plaintext in a database is a
-- 6-digit secret anyone who reads the database has. bcrypt also makes the
-- 1,000,000-value keyspace expensive to walk offline, and the attempt cap
-- below makes it pointless to walk online.
--
-- No separate MFA-enrollment state: there is nothing to enrol in. Every admin
-- already has a verified email address, which is why email was chosen over
-- TOTP for the first cut — a required factor that nobody has set up yet is an
-- admin panel nobody can log into.

CREATE TABLE IF NOT EXISTS "admin_login_codes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Opaque handle the client echoes back with the code. 32 random bytes: it
  -- is the only thing tying the second request to the first, so it must not
  -- be guessable and must not be the user id.
  "challenge" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "code_hash" TEXT NOT NULL,
  -- Wrong guesses so far. The challenge dies at 5.
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TEXT NOT NULL,
  -- Set the moment a code is accepted, so a correct code cannot be replayed.
  "consumed_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_login_codes_challenge_unique" ON "admin_login_codes" ("challenge");
CREATE INDEX IF NOT EXISTS "idx_admin_login_codes_user" ON "admin_login_codes" ("user_id");
