#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=./common.sh
. "$script_dir/common.sh"

deployment_dir=${1:-/opt/swiftflow-staging}
sh "$script_dir/preflight.sh" "$deployment_dir"
swiftflow_initialize "$deployment_dir"
swiftflow_require_command docker

for required_service in postgres webhook-comparison webhook-ingress action-executor
do
  container_id=$(swiftflow_compose ps -q "$required_service")
  [ -n "$container_id" ] \
    || swiftflow_fail "service has no container: $required_service"
  [ "$(printf '%s\n' "$container_id" | wc -l | awk '{ print $1 }')" = "1" ] \
    || swiftflow_fail "service must have exactly one container: $required_service"

  service_state=$(docker inspect --format \
    '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$container_id")
  [ "$service_state" = "running|healthy" ] \
    || swiftflow_fail "service is not healthy: $required_service ($service_state)"
done

swiftflow_postgres_exec \
  psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --dbname "$SWIFTFLOW_DATABASE_NAME" \
  --file /opt/swiftflow/self-host-health.sql

printf 'Doctor OK: all scoped services and required database objects are healthy.\n' >&2
