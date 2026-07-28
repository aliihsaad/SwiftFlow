#!/usr/bin/env sh
set -eu

deployment_dir="${1:-/opt/swiftflow-staging}"
environment_file="$deployment_dir/.env.worker.staging"
compose_file="$deployment_dir/compose.webhook-comparison.staging.yaml"

cd "$deployment_dir"

command -v openssl >/dev/null 2>&1
umask 077

if [ ! -f "$environment_file" ]; then
  : > "$environment_file"
fi
chmod 600 "$environment_file"

# Appending to a file whose last line has no newline would corrupt that entry.
if [ -s "$environment_file" ] \
  && [ "$(tail -c 1 "$environment_file" | wc -l)" -eq 0 ]
then
  printf '\n' >> "$environment_file"
fi

# A deployment created before a variable existed must gain it on the next run.
# Values already present are never read, reprinted, or rotated, and only the
# variable name is ever echoed.
has_variable() {
  grep -q "^$1=" "$environment_file"
}

ensure_generated_secret() {
  if has_variable "$1"; then
    return 0
  fi
  generated_secret="$(openssl rand -hex 32)"
  printf '%s=%s\n' "$1" "$generated_secret" >> "$environment_file"
  unset generated_secret
  printf 'Generated missing %s\n' "$1" >&2
}

ensure_literal_value() {
  if has_variable "$1"; then
    return 0
  fi
  printf '%s=%s\n' "$1" "$2" >> "$environment_file"
  printf 'Added missing %s\n' "$1" >&2
}

ensure_generated_secret SWIFTFLOW_STAGING_POSTGRES_ADMIN_PASSWORD
ensure_generated_secret WEBHOOK_COMPARISON_DB_PASSWORD
ensure_generated_secret WEBHOOK_INGRESS_DB_PASSWORD
ensure_generated_secret ACTION_EXECUTOR_DB_PASSWORD
# Staging-only Meta values. Instagram Login has its own product secret, while
# the general Meta secret remains useful during a dual-secret migration.
ensure_generated_secret INSTAGRAM_APP_SECRET
ensure_generated_secret META_APP_SECRET
ensure_generated_secret META_WEBHOOK_VERIFY_TOKEN
ensure_literal_value SWIFTFLOW_WEBHOOK_COMPARISON_IMAGE \
  swiftflow/webhook-comparison:staging
ensure_literal_value WEBHOOK_COMPARISON_WORKER_ID \
  swiftflow-staging-comparison-1
ensure_literal_value AUTOMATION_PROVIDER_SEND_ACCOUNT_BUDGET 60
ensure_literal_value AUTOMATION_PROVIDER_SEND_AUTOMATION_BUDGET 20
ensure_literal_value AUTOMATION_PROVIDER_SEND_BUDGET_WINDOW_SECONDS 3600
ensure_literal_value AUTOMATION_PROVIDER_SEND_CIRCUIT_FAILURE_THRESHOLD 5
ensure_literal_value AUTOMATION_PROVIDER_SEND_CIRCUIT_COOLDOWN_SECONDS 300

set -a
. "$environment_file"
set +a

compose_exec() {
  docker compose \
    --env-file "$environment_file" \
    -f "$compose_file" \
    exec -T postgres "$@"
}

# The database starts first and alone. The ingress healthcheck asserts its own
# least-privilege role, so it cannot pass until the schema below is applied.
docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up -d --wait postgres

# PostgreSQL runs /docker-entrypoint-initdb.d only on an empty data directory,
# so a database initialized before these files existed would never see them.
# Applying them explicitly makes this the upgrade path as well as the first-run
# path. Every statement in these files is idempotent; the non-idempotent base
# schema and smoke seed are deliberately excluded.
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/100-webhook-inbox.sql
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/200-webhook-comparison-role.sql
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/210-webhook-ingress-role.sql
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/220-action-outbox.sql
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/230-action-executor-role.sql
if [ "$(compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -Atc "select to_regclass('public.automation_workflow_versions') is not null")" != "t" ]
then
  compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
    -f /docker-entrypoint-initdb.d/240-workflow-versions.sql
fi
if [ "$(compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -Atc "select to_regclass('public.automation_execution_events') is not null")" != "t" ]
then
  compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
    -f /docker-entrypoint-initdb.d/250-execution-timeline.sql
fi
# The runtime-guard migration is additive and fully repeatable, so reapply it to
# repair grants/functions as well as create it on first upgrade.
compose_exec psql -v ON_ERROR_STOP=1 -U postgres -d swiftflow_staging \
  -f /docker-entrypoint-initdb.d/260-runtime-guards.sql
compose_exec sh /docker-entrypoint-initdb.d/300-worker-login.sh
compose_exec sh /docker-entrypoint-initdb.d/310-ingress-login.sh
compose_exec sh /docker-entrypoint-initdb.d/320-executor-login.sh

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up -d --build --wait

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  -e "PGPASSWORD=$WEBHOOK_COMPARISON_DB_PASSWORD" \
  postgres \
  psql \
  -h 127.0.0.1 \
  -U swiftflow_webhook_worker_staging \
  -d swiftflow_staging \
  -f /opt/swiftflow/verify-webhook-comparison-role.sql

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  -e "PGPASSWORD=$WEBHOOK_INGRESS_DB_PASSWORD" \
  postgres \
  psql \
  -h 127.0.0.1 \
  -U swiftflow_webhook_ingress_staging \
  -d swiftflow_staging \
  -f /opt/swiftflow/verify-webhook-ingress-role.sql

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  -e "PGPASSWORD=$ACTION_EXECUTOR_DB_PASSWORD" \
  postgres \
  psql \
  -h 127.0.0.1 \
  -U swiftflow_action_executor_staging \
  -d swiftflow_staging \
  -f /opt/swiftflow/verify-action-executor-role.sql

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  webhook-ingress \
  node \
  node_modules/tsx/dist/cli.mjs \
  workers/webhook-ingress-smoke.ts

attempt=1
until docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  postgres \
  psql \
  -U postgres \
  -d swiftflow_staging \
  -f /opt/swiftflow/verify-ingress-result.sql
do
  if [ "$attempt" -ge 10 ]; then
    echo "Signed ingress smoke did not reach the verified state." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

attempt=1
until docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  exec -T \
  postgres \
  psql \
  -U postgres \
  -d swiftflow_staging \
  -f /opt/swiftflow/verify-smoke-result.sql
do
  if [ "$attempt" -ge 10 ]; then
    echo "Synthetic comparison did not reach the verified state." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  ps
