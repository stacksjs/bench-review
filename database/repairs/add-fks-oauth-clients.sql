-- Add the missing "oauth_clients"."user_id" column and its foreign key (1 row).
--
--   oauth_clients.user_id -> users.id
--
-- This one needs a COLUMN, not just a constraint: the model declares
-- `belongsTo: ['User']` but `user_id` is absent from both the table and the
-- model's own `attributes`, so the relationship was never given anywhere to
-- live. Every other repair in this directory rebuilds a table; this one does
-- not have to, because SQLite permits ADD COLUMN with a REFERENCES clause as
-- long as the column defaults to NULL.
--
-- Nullable on purpose. The single existing row is the framework's "Personal
-- Access Client", which belongs to no user and should not be forced to.

PRAGMA foreign_keys=OFF;

ALTER TABLE oauth_clients ADD COLUMN user_id INTEGER REFERENCES "users"("id");

PRAGMA foreign_keys=ON;
