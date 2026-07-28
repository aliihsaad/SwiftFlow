#!/usr/bin/env sh
set -eu

: "${WEBHOOK_INGRESS_DB_PASSWORD:?Set WEBHOOK_INGRESS_DB_PASSWORD}"

psql \
  --set=ON_ERROR_STOP=1 \
  --set=ingress_password="$WEBHOOK_INGRESS_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
select format(
  'create role swiftflow_webhook_ingress_staging login password %L nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
  :'ingress_password'
)
where not exists (
  select 1
  from pg_roles
  where rolname = 'swiftflow_webhook_ingress_staging'
)
\gexec

select format(
  'alter role swiftflow_webhook_ingress_staging password %L',
  :'ingress_password'
)
\gexec

grant swiftflow_webhook_ingress to swiftflow_webhook_ingress_staging;
SQL
