# Cleanup Review Delete Candidates

Date: 2026-05-29

These files were moved here for user review. They were not deleted. This folder is intended as a single review point so the user can inspect and delete approved candidates later.

## Folders

- `duplicate-deliverables/deliverables/` - Duplicate security deliverables that matched canonical files under `docs/detailed-security-report/`.
- `generated-playwright-cli/.playwright-cli/` - Generated Playwright CLI capture and log files.
- `supabase-temp/.temp/` - Supabase CLI local metadata, including the previously dirty `cli-latest` file.
- `generated-cache/` - Ignored generated cache files such as `tsconfig.tsbuildinfo`.
- `legacy-root-scripts/` - Old root utility scripts moved out of the repository root for review.
- `root-evidence-images/` - Old root evidence screenshots moved for review without deleting duplicates.
- `security-sensitive/` - Old security test/exploit artifacts. This folder may contain credential-like material and should be deleted only after credential rotation and repository-history decisions are complete.

## Not Moved

- `package-lock.json` was intentionally not moved because package-manager cleanup still needs approval.
- `pnpm-lock.yaml` was intentionally not moved.
- `docs/review-results/review-result.md` was intentionally not moved because app-review evidence placement is a separate decision.
- `docs/superpowers/plans/*` was intentionally not moved because plan archiving is owned by a separate cleanup handoff.
- `docs/detailed-security-report/*` was intentionally not moved because it is canonical evidence.
