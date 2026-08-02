#!/usr/bin/env sh
set -eu

swiftflow_fail() {
  printf 'SwiftFlow self-host operation failed: %s\n' "$*" >&2
  exit 1
}

swiftflow_require_command() {
  command -v "$1" >/dev/null 2>&1 \
    || swiftflow_fail "required command is unavailable: $1"
}

swiftflow_validate_database_identifier() {
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' \
    || swiftflow_fail "invalid PostgreSQL identifier"
}

swiftflow_validate_project_name() {
  printf '%s\n' "$1" | grep -Eq '^swiftflow-[a-z0-9_-]+$' \
    || swiftflow_fail "Compose project must use the swiftflow- prefix"
}

swiftflow_resolve_file() {
  case "$2" in
    /*) printf '%s\n' "$2" ;;
    *) printf '%s/%s\n' "$1" "$2" ;;
  esac
}

swiftflow_initialize() {
  swiftflow_deployment_input=${1:-/opt/swiftflow-staging}
  [ -d "$swiftflow_deployment_input" ] \
    || swiftflow_fail "deployment directory does not exist"

  SWIFTFLOW_DEPLOYMENT_DIR=$(
    CDPATH= cd -- "$swiftflow_deployment_input" && pwd -P
  )
  SWIFTFLOW_ENV_FILE=$(
    swiftflow_resolve_file \
      "$SWIFTFLOW_DEPLOYMENT_DIR" \
      "${SWIFTFLOW_ENV_FILE:-.env.worker.staging}"
  )
  SWIFTFLOW_COMPOSE_FILE=$(
    swiftflow_resolve_file \
      "$SWIFTFLOW_DEPLOYMENT_DIR" \
      "${SWIFTFLOW_COMPOSE_FILE:-compose.webhook-comparison.staging.yaml}"
  )
  SWIFTFLOW_COMPOSE_PROJECT=${SWIFTFLOW_COMPOSE_PROJECT:-swiftflow-webhook-comparison-staging}
  SWIFTFLOW_DATABASE_NAME=${SWIFTFLOW_DATABASE_NAME:-swiftflow_staging}
  SWIFTFLOW_DATABASE_ADMIN_USER=${SWIFTFLOW_DATABASE_ADMIN_USER:-postgres}

  swiftflow_validate_project_name "$SWIFTFLOW_COMPOSE_PROJECT"
  swiftflow_validate_database_identifier "$SWIFTFLOW_DATABASE_NAME"
  swiftflow_validate_database_identifier "$SWIFTFLOW_DATABASE_ADMIN_USER"

  [ -f "$SWIFTFLOW_ENV_FILE" ] \
    || swiftflow_fail "environment file is missing"
  [ ! -L "$SWIFTFLOW_ENV_FILE" ] \
    || swiftflow_fail "environment file must not be a symbolic link"
  [ -f "$SWIFTFLOW_COMPOSE_FILE" ] \
    || swiftflow_fail "Compose file is missing"
  [ ! -L "$SWIFTFLOW_COMPOSE_FILE" ] \
    || swiftflow_fail "Compose file must not be a symbolic link"

  export \
    SWIFTFLOW_DEPLOYMENT_DIR \
    SWIFTFLOW_ENV_FILE \
    SWIFTFLOW_COMPOSE_FILE \
    SWIFTFLOW_COMPOSE_PROJECT \
    SWIFTFLOW_DATABASE_NAME \
    SWIFTFLOW_DATABASE_ADMIN_USER
}

swiftflow_compose() {
  docker compose \
    -p "$SWIFTFLOW_COMPOSE_PROJECT" \
    --env-file "$SWIFTFLOW_ENV_FILE" \
    -f "$SWIFTFLOW_COMPOSE_FILE" \
    "$@"
}

swiftflow_postgres_exec() {
  swiftflow_compose exec -T postgres "$@"
}
