# Self-host operations foundation

## Scope

This is the first recovery and diagnostics layer for the provider-neutral
automation staging stack. It does **not** claim that the complete web
application is Supabase-free or ready for public self-host installation.

Every command is scoped to the Compose project passed through
`SWIFTFLOW_COMPOSE_PROJECT`, which must start with `swiftflow-`. The default is
`swiftflow-webhook-comparison-staging`. The commands never enumerate or mutate
unrelated Docker projects on a shared host.

## Commands

Run these from the reviewed deployment artifact on the Docker host:

```sh
sh scripts/self-host/preflight.sh /opt/swiftflow-staging
sh scripts/self-host/doctor.sh /opt/swiftflow-staging
sh scripts/self-host/backup.sh /opt/swiftflow-staging /var/backups/swiftflow
```

`preflight.sh` checks:

- Docker Compose v2 and required host commands;
- a non-symlinked, operator-owned environment file with mode `0400` or `0600`;
- exactly one populated value for every required database and Meta secret;
- the four expected scoped services;
- a valid Compose model with no published host ports.

`doctor.sh` additionally requires exactly one healthy container for PostgreSQL,
comparison, ingress, and action execution. It runs a database schema check and
prints only operational counts. Tokens and secret values are never selected or
printed.

## Backup contract

The backup command:

1. refuses to run unless `doctor` passes;
2. writes into a mode-`0700` backup root under an explicit restrictive
   `umask 077`;
3. creates a PostgreSQL custom-format dump without owners or privileges;
4. records deterministic row counts and required-schema presence;
5. records the Compose checksum and release reference without copying the
   environment file;
6. checksums every artifact;
7. atomically renames the completed temporary directory into place.

The environment file and Meta/database secrets are never included.

## Restore rehearsal

Restore is deliberately rehearsal-only in this slice:

```sh
sh scripts/self-host/restore-rehearsal.sh \
  /opt/swiftflow-staging \
  /var/backups/swiftflow/swiftflow-staging-YYYYMMDDTHHMMSSZ \
  swiftflow_restore_20260728
```

The target must be a new database whose name starts with
`swiftflow_restore_`. The command refuses to target the live database, refuses
to overwrite an existing database, verifies all checksums, restores with
`--exit-on-error`, and compares the restored inventory byte-for-byte with the
source inventory. It leaves the rehearsal database in place for inspection.

Promotion or destructive replacement of the live database is intentionally not
automated. That requires a separately approved maintenance window and a
versioned full-stack release.

## Upgrade and rollback contract

Use:

```sh
sh scripts/self-host/upgrade.sh \
  /opt/swiftflow-staging \
  /var/backups/swiftflow
```

The wrapper runs preflight, creates and verifies a backup, executes the
convergent deployment script, and runs doctor afterward. If deployment fails,
it reports the exact recovery point and stops. It never attempts an automatic
database restore, because an ambiguous partially-applied migration must be
diagnosed before any destructive action.

Artifact rollback currently means restoring the previously reviewed deployment
artifact and rerunning its convergent deployment script. Database rollback is
not automatic; migrations in this transformation remain forward-compatible.

## Remaining stable-v1 operations work

- extend these contracts to the future full application Compose stack;
- add object-storage manifests and restore verification;
- add versioned release bundles and signed checksums;
- rehearse restore on a genuinely fresh host;
- add backup freshness and schema/application version reporting to the product
  health dashboard;
- record a full upgrade and artifact-rollback drill.
