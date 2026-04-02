# Meta App Review Master Plan

This folder is the source of truth for the staged execution plan.

## Goal

Turn the project into a review-safe, production-ready release with the highest realistic probability of passing Meta App Review, while preserving a stable baseline between stages.

## Structure

- [progress-tracker.md](./progress-tracker.md)
  - Global tracker, stage gates, dependencies, and implementation order
- [stage-0-documentation-foundation.md](./stage-0-documentation-foundation.md)
- [stage-1-product-scope-freeze.md](./stage-1-product-scope-freeze.md)
- [stage-2-phase-1-surface-cleanup.md](./stage-2-phase-1-surface-cleanup.md)
- [stage-3-meta-integration-consolidation.md](./stage-3-meta-integration-consolidation.md)
- [stage-4-security-and-capability-layer.md](./stage-4-security-and-capability-layer.md)
- [stage-5-openrouter-first-ai-migration.md](./stage-5-openrouter-first-ai-migration.md)
- [stage-6-reviewer-safe-ux-and-compliance.md](./stage-6-reviewer-safe-ux-and-compliance.md)
- [stage-7-reliability-hardening.md](./stage-7-reliability-hardening.md)
- [stage-8-submission-package-finalization.md](./stage-8-submission-package-finalization.md)
- [stage-9-post-approval-expansion.md](./stage-9-post-approval-expansion.md)

## Core Decisions

- Submit Phase 1 first, not the full feature set
- Keep the reviewer path narrow and deterministic
- Remove or hard-disable legacy Meta OAuth
- Standardize on one verified Graph API version family
- Encrypt Meta tokens at the application layer
- Move AI architecture to `OpenRouter-first`
- Remove fake billing claims until billing and enforcement exist

## Rules

- A later stage must not casually reopen a completed earlier stage
- Every stage must pass its exit gate before the next dependent stage is treated as active
- Review-safe behavior always takes priority over breadth of features
