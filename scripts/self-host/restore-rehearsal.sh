#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=./common.sh
. "$script_dir/common.sh"

deployment_dir=${1:-}
backup_directory=${2:-}
target_database=${3:-}

[ -n "$deployment_dir" ] \
  || swiftflow_fail "usage: restore-rehearsal.sh DEPLOYMENT_DIR BACKUP_DIR TARGET_DATABASE"
[ -n "$backup_directory" ] \
  || swiftflow_fail "backup directory is required"
[ -n "$target_database" ] \
  || swiftflow_fail "target rehearsal database is required"

case "$backup_directory" in
  /*) ;;
  *) swiftflow_fail "backup directory must be an absolute path" ;;
esac
[ -d "$backup_directory" ] \
  || swiftflow_fail "backup directory does not exist"
[ ! -L "$backup_directory" ] \
  || swiftflow_fail "backup directory must not be a symbolic link"
backup_directory=$(CDPATH= cd -- "$backup_directory" && pwd -P)

swiftflow_validate_database_identifier "$target_database"
case "$target_database" in
  swiftflow_restore_*) ;;
  *) swiftflow_fail "rehearsal database must use the swiftflow_restore_ prefix" ;;
esac

for backup_file in database.dump inventory.json manifest.txt SHA256SUMS
do
  [ -f "$backup_directory/$backup_file" ] \
    || swiftflow_fail "backup is incomplete: $backup_file is missing"
done

sh "$script_dir/doctor.sh" "$deployment_dir" >/dev/null
swiftflow_initialize "$deployment_dir"
swiftflow_require_command cmp
[ "$target_database" != "$SWIFTFLOW_DATABASE_NAME" ] \
  || swiftflow_fail "restore rehearsal must never target the live database"

(
  CDPATH= cd -- "$backup_directory"
  sha256sum --check SHA256SUMS
)
grep -qx "database=$SWIFTFLOW_DATABASE_NAME" "$backup_directory/manifest.txt" \
  || swiftflow_fail "backup database does not match this deployment"

database_exists=$(
  swiftflow_postgres_exec \
    psql \
    --no-psqlrc \
    --quiet \
    --tuples-only \
    --no-align \
    --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
    --dbname postgres \
    --command "select 1 from pg_database where datname = '$target_database'"
)
[ -z "$database_exists" ] \
  || swiftflow_fail "target rehearsal database already exists; it will not be overwritten"

swiftflow_postgres_exec \
  createdb \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --template template0 \
  --encoding UTF8 \
  "$target_database"

if ! swiftflow_postgres_exec \
  pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --dbname "$target_database" \
  < "$backup_directory/database.dump"
then
  swiftflow_fail "restore failed; the rehearsal database was left in place for diagnosis"
fi

restored_inventory=$(mktemp)
cleanup_restored_inventory() {
  rm -f -- "$restored_inventory"
}
trap cleanup_restored_inventory EXIT HUP INT TERM

swiftflow_postgres_exec \
  psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --username "$SWIFTFLOW_DATABASE_ADMIN_USER" \
  --dbname "$target_database" \
  --file /opt/swiftflow/self-host-inventory.sql \
  > "$restored_inventory"

cmp -s "$backup_directory/inventory.json" "$restored_inventory" \
  || swiftflow_fail "restored row counts or required schema objects do not match the backup"

printf 'Restore rehearsal OK: %s was restored and verified without touching %s.\n' \
  "$target_database" \
  "$SWIFTFLOW_DATABASE_NAME" >&2
