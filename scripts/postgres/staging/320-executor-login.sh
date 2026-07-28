#!/usr/bin/env sh
set -eu

: "${ACTION_EXECUTOR_DB_PASSWORD:?Set ACTION_EXECUTOR_DB_PASSWORD}"

psql \
  --set=ON_ERROR_STOP=1 \
  --set=executor_password="$ACTION_EXECUTOR_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
select format(
  'create role swiftflow_action_executor_staging login password %L nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
  :'executor_password'
)
where not exists (
  select 1 from pg_roles where rolname = 'swiftflow_action_executor_staging'
)
\gexec

select format(
  'alter role swiftflow_action_executor_staging password %L',
  :'executor_password'
)
\gexec

grant swiftflow_action_executor to swiftflow_action_executor_staging;
SQL
