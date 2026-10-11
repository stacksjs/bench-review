DELETE FROM "review_flags" WHERE "user_id" IS NOT NULL AND "id" NOT IN (SELECT MAX("id") FROM "review_flags" WHERE "user_id" IS NOT NULL GROUP BY "judge_review_id", "user_id");
