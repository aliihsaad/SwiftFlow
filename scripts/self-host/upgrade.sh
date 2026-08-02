#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=./common.sh
. "$script_dir/common.sh"

deployment_dir=${1:-/opt/swiftflow-staging}
backup_root=${2:-/var/backups/swiftflow}

sh "$script_dir/preflight.sh" "$deployment_dir"
backup_directory=$(
  sh "$script_dir/backup.sh" "$deployment_dir" "$backup_root"
)

printf 'Verified pre-upgrade backup: %s\n' "$backup_directory" >&2

if ! sh "$deployment_dir/scripts/deploy-webhook-comparison-staging.sh" "$deployment_dir"
then
  printf 'Upgrade failed. No automatic database restore was attempted.\n' >&2
  printf 'Keep the failed deployment for diagnosis and retain backup: %s\n' \
    "$backup_directory" >&2
  exit 1
fi

sh "$script_dir/doctor.sh" "$deployment_dir"
printf 'Upgrade OK. Recovery point: %s\n' "$backup_directory" >&2
