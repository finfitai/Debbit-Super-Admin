# Edge Function tests

`run.sh` builds a throw-away Postgres from the debbit migrations, puts PostgREST in front of it (the same query layer Supabase
uses, including the 1,000-row response cap), seeds a little data, and runs every `admin-*` Edge Function — the real TypeScript
files, unchanged — against it with `edge-functions.test.mjs`. Only the Supabase Auth calls are faked.

It exists because these functions are never type-checked against the database: a column that was renamed, a PostgREST embed
with no foreign key behind it, or an unbounded `select` that silently stops at 1,000 rows all look fine until production.

See the header of `run.sh` for the environment variables it needs.
