#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=./common.sh
. "$script_dir/common.sh"

umask 077

deployment_dir=${1:-/opt/swiftflow-staging}
backup_root=${2:-/var/backups/swiftflow}

case "$backup_root" in
  /*) ;;
  *) swiftflow_fail "backup root must be an absolute path" ;;
esac
[ "$backup_root" != "/" ] \
  || swiftflow_fail "backup root must not be the filesystem root"
[ ! -L "$backup_root" ] \
  || swiftflow_fail "backup root must not be a symbolic link"

sh "$script_dir/doctor.sh" "$deployment_dir" >/dev/null
swiftflow_initialize "$deployment_dir"
swiftflow_require_command sha256sum
swiftflow_require_command mktemp

mkdir -p -- "$backup_root"
chmod 700 "$backup_root"
backup_root=$(CDPATH= cd -- "$backup_root" && pwd -P)

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
final_directory="$backup_root/swiftflow-staging-$timestamp"
[ ! -e "$final_directory" ] \
  || swiftflow_fail "backup destination already exists"

working_directory=$(mktemp -d "$backup_root/.swiftflow-backup.XXXXXX")
cleanup_backup_working_directory() {
  if [ -n "${working_directory:-}" ] && [ -d "$working_directory" ]
  then
    rm -f -- \
      "$working_directory/database.dump" \
      "$working_directory/inventory.json" \
      "$working_directory/manifest.txt" \
      "$working_directory/SHA256SUMS"
    rmdir -- "$working_directory" 2>/dev/null || true
  fi
}
trap cleanup_backup_working_directory EXIT HUP INT TERM

swiftflow_postgres_exec \
  pg_dump \
  --no-password \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --dbname "$SWIFTFLOW_DATABASE_NAME" \
  > "$working_directory/database.dump"

swiftflow_postgres_exec \
  psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --dbname "$SWIFTFLOW_DATABASE_NAME" \
  --file /opt/swiftflow/self-host-inventory.sql \
  > "$working_directory/inventory.json"

release_ref=${SWIFTFLOW_RELEASE_REF:-unversioned}
printf '%s\n' "$release_ref" | grep -Eq '^[A-Za-z0-9._-]+$' \
  || swiftflow_fail "SWIFTFLOW_RELEASE_REF contains unsupported characters"
compose_sha256=$(sha256sum "$SWIFTFLOW_COMPOSE_FILE" | awk '{ print $1 }')

{
  printf 'format_version=1\n'
  printf 'created_at=%s\n' "$timestamp"
  printf 'compose_project=%s\n' "$SWIFTFLOW_COMPOSE_PROJECT"
  printf 'database=%s\n' "$SWIFTFLOW_DATABASE_NAME"
  printf 'release_ref=%s\n' "$release_ref"
  printf 'compose_sha256=%s\n' "$compose_sha256"
} > "$working_directory/manifest.txt"

(
  CDPATH= cd -- "$working_directory"
  sha256sum database.dump inventory.json manifest.txt > SHA256SUMS
)
chmod 600 "$working_directory"/*
chmod 700 "$working_directory"
mv -- "$working_directory" "$final_directory"
working_directory=

printf '%s\n' "$final_directory"
