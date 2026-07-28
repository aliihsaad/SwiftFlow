#!/usr/bin/env sh
set -eu

: "${WEBHOOK_COMPARISON_DB_PASSWORD:?Set WEBHOOK_COMPARISON_DB_PASSWORD}"

psql \
  --set=ON_ERROR_STOP=1 \
  --set=worker_password="$WEBHOOK_COMPARISON_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
select format(
  'create role swiftflow_webhook_worker_staging login password %L nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
  :'worker_password'
)
where not exists (
  select 1
  from pg_roles
  where rolname = 'swiftflow_webhook_worker_staging'
)
\gexec

select format(
  'alter role swiftflow_webhook_worker_staging password %L',
  :'worker_password'
)
\gexec

grant swiftflow_webhook_comparison to swiftflow_webhook_worker_staging;
SQL
