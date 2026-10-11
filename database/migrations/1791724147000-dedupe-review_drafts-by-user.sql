DELETE FROM "review_drafts" WHERE "id" NOT IN (SELECT MAX("id") FROM "review_drafts" GROUP BY "user_id");
