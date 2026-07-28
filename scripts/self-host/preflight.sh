#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=./common.sh
. "$script_dir/common.sh"

swiftflow_initialize "${1:-/opt/swiftflow-staging}"

for required_command in docker grep awk stat sha256sum mktemp
do
  swiftflow_require_command "$required_command"
done
docker compose version >/dev/null 2>&1 \
  || swiftflow_fail "Docker Compose v2 is unavailable"

environment_mode=$(stat -c '%a' "$SWIFTFLOW_ENV_FILE")
case "$environment_mode" in
  400|600) ;;
  *) swiftflow_fail "environment file permissions must be 0400 or 0600" ;;
esac

environment_owner=$(stat -c '%u' "$SWIFTFLOW_ENV_FILE")
[ "$environment_owner" = "$(id -u)" ] \
  || swiftflow_fail "environment file must be owned by the current operator"

required_variables='
SWIFTFLOW_STAGING_POSTGRES_ADMIN_PASSWORD
WEBHOOK_COMPARISON_DB_PASSWORD
WEBHOOK_INGRESS_DB_PASSWORD
ACTION_EXECUTOR_DB_PASSWORD
INSTAGRAM_APP_SECRET
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
'

for variable_name in $required_variables
do
  awk -F= -v required_name="$variable_name" '
    $1 == required_name {
      matches += 1
      if (length(substr($0, index($0, "=") + 1)) > 0) {
        populated += 1
      }
    }
    END {
      exit !(matches == 1 && populated == 1)
    }
  ' "$SWIFTFLOW_ENV_FILE" \
    || swiftflow_fail "required environment variable is missing, empty, or duplicated: $variable_name"

  if awk -F= -v required_name="$variable_name" '
    $1 == required_name {
      value = tolower(substr($0, index($0, "=") + 1))
      if (
        value ~ /^your-/ ||
        value ~ /^change-me/ ||
        value ~ /^replace-me/ ||
        value ~ /^placeholder/
      ) {
        placeholder = 1
      }
    }
    END { exit !placeholder }
  ' "$SWIFTFLOW_ENV_FILE"
  then
    swiftflow_fail "placeholder value remains for: $variable_name"
  fi
done

swiftflow_compose config --quiet

configured_services=$(swiftflow_compose config --services)
for required_service in postgres webhook-comparison webhook-ingress action-executor
do
  printf '%s\n' "$configured_services" | grep -qx "$required_service" \
    || swiftflow_fail "required Compose service is missing: $required_service"
done

if swiftflow_compose config | grep -Eq '^[[:space:]]+ports:'
then
  swiftflow_fail "the provider-neutral staging stack must not publish host ports"
fi

printf 'Preflight OK: %s (%s)\n' \
  "$SWIFTFLOW_COMPOSE_PROJECT" \
  "$SWIFTFLOW_DEPLOYMENT_DIR" >&2
