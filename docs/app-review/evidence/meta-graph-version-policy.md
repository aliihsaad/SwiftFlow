# Meta Graph Version Policy

Last updated: 2026-04-03

## Current Policy

The review-safe release standardizes active Meta Graph API usage on:

- `v21.0`

## Why

Meta's official Graph API versions page currently lists:

- `v21.0` as the newest listed Graph API version
- `v19.0` expiring on May 21, 2026
- `v18.0` expired on January 26, 2026

Source:

- https://developers.facebook.com/docs/graph-api/changelog/versions

## Engineering Decision

To avoid mixed behavior and reviewer confusion:

- legacy `v19.0` OAuth flow has been hard-disabled
- expired `v18.0` references have been removed from active code paths
- previously mixed `v24.0` references in active code were replaced with the shared `v21.0` policy

## Shared Constants

Next.js / server runtime:

- `lib/meta-graph-version.ts`

Supabase edge runtime:

- `supabase/functions/_shared/meta-graph.ts`

## Remaining Work

- move remaining `v21.0` literals in active code onto the shared constants where practical
- keep reviewer docs aligned with the single-version policy
