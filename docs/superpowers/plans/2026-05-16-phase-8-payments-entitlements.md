# Phase 8 Payments and Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paid plan enforcement for premium capabilities after the features are stable and tested.

**Architecture:** Stripe webhooks become the source of truth for subscription state. App entitlements are stored in Supabase and consumed by UI, API middleware, Developer API, MCP, assistant actions, media quotas, retention policies, and trend reports.

**Tech Stack:** Stripe Checkout/Billing/Webhooks/Entitlements, Next.js API routes, Supabase, Developer API entitlements, Settings/Subscription UI, Vitest.

---

## Research Checkpoint

- [ ] Review current Stripe Checkout/Billing/webhook docs before implementing.
- [ ] Review Stripe entitlements events before designing entitlement sync.
- [ ] Review tax/invoice/trial/cancellation requirements before launch copy.
- [ ] Confirm payment provider terms and regional availability.

## Files

- Create: `lib/billing/stripe.ts`
- Create: `lib/billing/entitlements.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/billing/webhook/route.ts`
- Modify: `lib/developer-api/entitlements.ts`
- Modify: `lib/retention/policy.ts`
- Modify: `components/settings/**`
- Modify: `components/subscription/**`
- Modify: `app/pricing/page.tsx`
- Create/modify: `supabase/migrations/**`
- Create: `tests/billing/stripe-webhook.test.ts`
- Create: `tests/billing/entitlements.test.ts`

## Tasks

- [ ] Define plan matrix: Free, Paid, Pro/internal, with exact limits for Developer API, MCP connectors, assistant write actions, media storage, generated images, retention, deep trend reports, automations, and API keys.
- [ ] Add subscription/entitlement tables or extend existing entitlement storage.
- [ ] Implement checkout session creation for authenticated workspace owners/admins.
- [ ] Implement billing portal session.
- [ ] Implement Stripe webhook handler with signature verification and idempotency.
- [ ] Sync subscription status, current period, customer ID, plan, and entitlement flags.
- [ ] Add backend entitlement checks for premium capabilities.
- [ ] Add UI gates that explain limits without hiding existing beta/test functionality until payment launch flag is enabled.
- [ ] Add downgrade and grace-period behavior.
- [ ] Add tests for active, trialing, past_due, canceled, and entitlement update events.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Use Stripe test mode to complete checkout, receive webhook, update entitlement, open portal, cancel, and verify downgrade.
- [ ] Verify Developer API remains available when launch flag says payments are not enforced.
- [ ] Verify Developer API is gated when launch flag says payments are enforced.

## Exit Gate

- [ ] Phase 8 is complete only when entitlement state is webhook-driven, idempotent, tested, and can be enabled without breaking pre-payment testing unexpectedly.
