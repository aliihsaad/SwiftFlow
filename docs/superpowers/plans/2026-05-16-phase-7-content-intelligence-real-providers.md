# Phase 7 Content Intelligence Real Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Content Intelligence Phase 4 from benchmark fallback to reliable, labeled, cost-controlled live trend/research providers.

**Architecture:** Add provider adapters behind an existing provider-neutral interface. Every provider result must be cached, labeled by evidence quality, rate-limited, timeout-bound, and safely downgraded to benchmark/workspace analytics fallback.

**Tech Stack:** Next.js API routes, content-intelligence library, Developer API, Supabase cache tables, optional DataForSEO/SerpApi/Google Trends-compatible provider, Vitest.

---

## Research Checkpoint

- [ ] Research current official provider docs and pricing before selecting DataForSEO, SerpApi, Google Trends-compatible tooling, Meta-native-only, or another provider.
- [ ] Confirm terms of service permit the intended SaaS use.
- [ ] Confirm provider supports the required geography/platform/query use cases.
- [ ] Confirm caching policy and rate limits before implementation.

## Files

- Modify: `lib/content-intelligence/**`
- Modify: `app/api/content-intelligence/**`
- Modify: `app/api/developer/v1/content-intelligence/**`
- Modify: `components/analytics/**`
- Modify: `components/create/content-intelligence-panel.tsx`
- Create: `lib/content-intelligence/providers/live-provider-types.ts`
- Create: `lib/content-intelligence/providers/provider-cache.ts`
- Create: `tests/content-intelligence/live-provider-cache.test.ts`
- Create: `tests/content-intelligence/provider-fallback.test.ts`

## Tasks

- [ ] Write provider decision doc with cost, legal, reliability, latency, cacheability, and expected user value.
- [ ] Add provider capability model: standard report, deep report, hashtag trend, topic trend, competitor-like query, platform-specific insights.
- [ ] Add cache table or cache abstraction for live trend results.
- [ ] Add provider adapter with timeout, retry, error classification, and rate limit.
- [ ] Add fallback order: workspace analytics, cached provider result, benchmark guidance, unavailable state.
- [ ] Add UI evidence labels: live provider, cached provider, workspace analytics, benchmark fallback, no findings.
- [ ] Add Developer API/MCP response metadata showing evidence quality and provider freshness.
- [ ] Add entitlement hook for standard/deep reports but leave unlocked until payments are ready.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Test timeout/failure path returns fallback without blocking analytics page.
- [ ] Test cached provider result is reused and marked correctly.
- [ ] Test deep report is disabled or preview-gated when entitlement says no.

## Exit Gate

- [ ] Phase 7 is complete only when live provider usage is legal, cost-limited, cached, labeled, and never blocks core analytics.
