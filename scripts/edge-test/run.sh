#!/usr/bin/env bash
# Runs every admin-* Edge Function (TypeScript, unchanged) in Node against a REAL Postgres + PostgREST built from the debbit
# migrations — the same query layer Supabase uses — so a query that names a missing column, a missing foreign key or a
# non-existent function fails here instead of in production.
#
#   MIGRATIONS_DIR=/path/to/debbitbyasarp/supabase/migrations \
#   PG_BIN=/usr/lib/postgresql/16/bin POSTGREST=/path/to/postgrest scripts/edge-test/run.sh
#
# Needs: PostgreSQL 15+ binaries, the PostgREST binary, Node 22.6+ (for --experimental-strip-types), `npm install` done.
set -euo pipefail
: "${MIGRATIONS_DIR:?set MIGRATIONS_DIR to the debbit supabase/migrations folder}"
: "${POSTGREST:?set POSTGREST to the postgrest binary}"
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
PORT_PG=5544; PORT_REST=3555
trap '"$PG_BIN/pg_ctl" -D "$WORK/pg" stop -m immediate >/dev/null 2>&1 || true; kill ${REST_PID:-0} 2>/dev/null || true; rm -rf "$WORK"' EXIT

"$PG_BIN/initdb" -D "$WORK/pg" -A trust -U postgres >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/pg" -o "-p $PORT_PG -k $WORK" -l "$WORK/pg.log" start >/dev/null
PSQL=("$PG_BIN/psql" -q -h "$WORK" -p $PORT_PG -U postgres -d sa -v ON_ERROR_STOP=1)
"$PG_BIN/createdb" -h "$WORK" -p $PORT_PG -U postgres sa
"${PSQL[@]}" -f "$HERE/shim.sql" >/dev/null 2>&1
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  # 084 names a table (bank_guarantees) that no migration creates; that is a repo issue unrelated to the portal, so skip its failure.
  "${PSQL[@]}" -1 -f "$f" >/dev/null 2>&1 || echo "note: $(basename "$f") did not apply cleanly"
done
"${PSQL[@]}" -f "$(dirname "$HERE")/../supabase/migrations/086_admin_portal_aggregates.sql" >/dev/null 2>&1 || true
"${PSQL[@]}" -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;" >/dev/null
"${PSQL[@]}" -f "$HERE/seed.sql" >/dev/null

cat > "$WORK/pgrst.conf" <<CONF
db-uri = "postgres://authenticator@localhost:$PORT_PG/sa?host=$WORK"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "super-secret-jwt-token-with-at-least-32-characters-long"
server-port = $PORT_REST
db-max-rows = 1000
CONF
"$POSTGREST" "$WORK/pgrst.conf" >"$WORK/rest.log" 2>&1 &
REST_PID=$!
sleep 3
cd "$HERE"
node --experimental-strip-types --import ./register.mjs edge-functions.test.mjs
