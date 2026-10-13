-- Evidence for a credential claim, above all a judge-profile claim.
--
-- Until now ClaimJudgeProfileAction took exactly one input: judgeId. The
-- credential queue then showed an admin a name, an email and the judge the
-- claimant had picked from a dropdown, and nothing else. Approving on that is
-- approving on nothing - and approval is what unlocks posting an official
-- response under a named sitting judge's identity (SubmitJudgeResponseAction),
-- which renders publicly beneath reviews of them.
--
-- So: what the claimant says establishes the claim, and a URL an admin can
-- open to check it (a court staff directory page, a bar profile, an official
-- biography). Free text plus a document reference is the minimum the issue
-- allows; a court-email verification loop would be stronger and needs a
-- mail-domain policy first.
--
-- Deliberately on `users` beside the other credential_* columns rather than in
-- a new table: a user holds exactly one claim at a time, and every existing
-- path that resets a claim (ClaimJudgeProfileAction, UpdateCredentialClaimAction)
-- already rewrites that column group as a unit. A side table would be a second
-- place to remember to clear.

ALTER TABLE "users" ADD COLUMN "credential_evidence" TEXT;
ALTER TABLE "users" ADD COLUMN "credential_evidence_url" TEXT;
