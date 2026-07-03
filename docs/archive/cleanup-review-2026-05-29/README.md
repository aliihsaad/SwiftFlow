# Cleanup Review Manifest

Date: 2026-05-29

This folder collects files that were moved for user review during the repository cleanup pass. The cleanup was move-only: nothing was intentionally deleted.

## Review Folders

- [delete-candidates](delete-candidates/) - files gathered for later user review before any deletion decision. This includes duplicate deliverables, generated Playwright logs, Supabase temp files, legacy root scripts, root evidence images, and security-sensitive test/proof scripts.
- [superseded-plans](superseded-plans/) - historical implementation plans superseded by the active 2026-05-16 production roadmap and phase plans.
- [loose-review-results](loose-review-results/) - loose review-result artifacts found during cleanup review.

## Active Files Kept In Place

- Current roadmap files remain active in `docs/superpowers/plans/`.
- `docs/detailed-security-report/` remains in place.
- `package-lock.json` remains in place.
- `pnpm-lock.yaml` remains in place.

## Warnings

- Files under `delete-candidates/security-sensitive/` may contain credential-like material or security test details. Review them carefully and avoid quoting their contents in public summaries.
- No package-manager decision was applied. Both lockfiles remain present until the project explicitly chooses a package-manager policy.
- The current 2026-05-16 roadmap and phase files remain the active planning source.
- This folder is for review, not an instruction to delete files automatically.

## Next Step

Review `delete-candidates/` manually. Delete that folder later only if the user explicitly approves deletion after review.
