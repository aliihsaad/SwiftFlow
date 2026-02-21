# Migration Notes

The active migration chain is now flattened to a single baseline:

- `20260221050000_baseline_schema.sql`

## What changed
- Historical migration SQL files were moved to:
  - `supabase/migrations-archive/`
- Remote database was reset and migration history was rebuilt from the single baseline.

## Going forward
- Add new incremental migrations in `supabase/migrations/` after the baseline.
- Keep timestamps unique and sortable (`YYYYMMDDHHMMSS_description.sql`).
- Do not edit the baseline after environments start depending on it.
