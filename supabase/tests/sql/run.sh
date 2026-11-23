#!/bin/bash
# Local only: throwaway Postgres 17 cluster, stub auth, the ladder migration applied TWICE (idempotent), then the RLS tests.
# Never point this at Supabase.
set -euo pipefail
D=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${PG_BIN:-/usr/lib/postgresql/17/bin}
TMP=$(mktemp -d); PORT=${PGPORT_TEST:-54391}
trap '"$BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
"$BIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null 2>&1
"$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null 2>&1
MIG=${MIG:-$D/migrations/20261122_ladder_entitlements_gifts.sql}
P="psql -q -X -v ON_ERROR_STOP=1 -h $TMP -p $PORT -U postgres -d postgres"
$P -f "$D/tests/sql/stub-auth.sql" >/dev/null 2>&1
$P -f "$MIG" >/dev/null 2>&1
$P -f "$MIG" >/dev/null 2>&1   # re-run: must be safe
$P -t -f "$D/tests/sql/ladder-rls-test.sql" | sed '/^$/d'
$P -f "$D/rollback/20261122_ladder_entitlements_gifts.down.sql" >/dev/null && echo "rollback applies cleanly"
