import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
    claimWebhookEvent,
    extractSubscriptionFields,
    handleSubscriptionDeleted,
    processStripeEvent,
    syncSubscription,
} from "@/lib/billing/webhook-sync"

/**
 * Minimal chainable fake for the supabase-js query surface used by
 * webhook-sync. Reads resolve from `readResults` by table name; writes are
 * captured into `writes`.
 */
type Write = { table: string; op: "upsert" | "update" | "insert"; payload: unknown; options?: unknown }

function createFakeAdmin(config: {
    readResults?: Record<string, unknown>
    upsertReturns?: Record<string, unknown[]>
}) {
    const writes: Write[] = []
    const readResults = config.readResults ?? {}
    const upsertReturns = config.upsertReturns ?? {}

    const admin = {
        from(table: string) {
            const chain = {
                upsert(payload: unknown, options?: unknown) {
                    writes.push({ table, op: "upsert", payload, options })
                    return {
                        select: () => Promise.resolve({ data: upsertReturns[table] ?? [{ id: "row" }], error: null }),
                        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
                    }
                },
                update(payload: unknown) {
                    writes.push({ table, op: "update", payload })
                    return { eq: () => Promise.resolve({ error: null }) }
                },
                select() {
                    return {
                        eq: () => ({
                            maybeSingle: () => Promise.resolve({ data: readResults[table] ?? null, error: null }),
                        }),
                    }
                },
            }
            return chain
        },
    }

    return { admin: admin as unknown as SupabaseClient, writes }
}

beforeEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m"
    process.env.STRIPE_PRICE_AGENCY_MONTHLY = "price_agency_m"
})

afterEach(() => {
    delete process.env.STRIPE_PRICE_PRO_MONTHLY
    delete process.env.STRIPE_PRICE_AGENCY_MONTHLY
})

const subscriptionObject = (overrides: Record<string, unknown> = {}) => ({
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspace_id: "ws-1" },
    items: {
        data: [{
            price: { id: "price_pro_m" },
            current_period_start: 1780000000,
            current_period_end: 1782592000,
        }],
    },
    ...overrides,
})

describe("claimWebhookEvent", () => {
    const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: {} } }

    it("claims unseen events", async () => {
        const { admin } = createFakeAdmin({ upsertReturns: { stripe_webhook_events: [{ id: "evt_1" }] } })
        expect(await claimWebhookEvent(admin, event)).toBe("new")
    })

    it("treats processed events as duplicates", async () => {
        const { admin } = createFakeAdmin({
            upsertReturns: { stripe_webhook_events: [] },
            readResults: { stripe_webhook_events: { status: "processed" } },
        })
        expect(await claimWebhookEvent(admin, event)).toBe("duplicate")
    })

    it("reclaims previously failed events so retries can heal", async () => {
        const { admin, writes } = createFakeAdmin({
            upsertReturns: { stripe_webhook_events: [] },
            readResults: { stripe_webhook_events: { status: "failed" } },
        })
        expect(await claimWebhookEvent(admin, event)).toBe("new")
        expect(writes.some((w) => w.table === "stripe_webhook_events" && w.op === "update")).toBe(true)
    })
})

describe("extractSubscriptionFields", () => {
    it("reads period bounds from the subscription item (new API shape)", () => {
        const fields = extractSubscriptionFields(subscriptionObject())
        expect(fields.priceId).toBe("price_pro_m")
        expect(fields.currentPeriodStart).toBe(new Date(1780000000 * 1000).toISOString())
        expect(fields.currentPeriodEnd).toBe(new Date(1782592000 * 1000).toISOString())
    })

    it("falls back to top-level period fields (legacy API shape)", () => {
        const fields = extractSubscriptionFields({
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            current_period_start: 1780000000,
            current_period_end: 1782592000,
            items: { data: [{ price: { id: "price_pro_m" } }] },
        })
        expect(fields.currentPeriodEnd).toBe(new Date(1782592000 * 1000).toISOString())
    })

    it("normalizes unknown statuses to none", () => {
        expect(extractSubscriptionFields(subscriptionObject({ status: "weird" })).status).toBe("none")
    })
})

describe("syncSubscription", () => {
    it("upserts subscription state and syncs entitlements to the price tier", async () => {
        const { admin, writes } = createFakeAdmin({})
        await syncSubscription(admin, "ws-1", subscriptionObject())

        const subWrite = writes.find((w) => w.table === "workspace_subscriptions")
        expect(subWrite?.payload).toMatchObject({
            workspace_id: "ws-1",
            plan_tier: "pro",
            status: "active",
            stripe_subscription_id: "sub_123",
        })

        const entitlementWrite = writes.find((w) => w.table === "workspace_entitlements")
        expect(entitlementWrite?.payload).toMatchObject({
            plan_tier: "pro",
            entitlement_source: "subscription",
            developer_api_enabled: true,
        })
    })

    it("never overwrites manual entitlement rows", async () => {
        const { admin, writes } = createFakeAdmin({
            readResults: { workspace_entitlements: { entitlement_source: "manual" } },
        })
        await syncSubscription(admin, "ws-1", subscriptionObject())

        expect(writes.some((w) => w.table === "workspace_entitlements" && w.op === "upsert")).toBe(false)
    })
})

describe("handleSubscriptionDeleted", () => {
    it("marks the subscription canceled with a downgrade grace window and frees entitlements", async () => {
        const { admin, writes } = createFakeAdmin({})
        await handleSubscriptionDeleted(admin, "ws-1", subscriptionObject({ status: "canceled" }))

        const subWrite = writes.find((w) => w.table === "workspace_subscriptions")
        expect(subWrite?.payload).toMatchObject({ status: "canceled", workspace_id: "ws-1" })
        expect((subWrite?.payload as Record<string, unknown>).downgrade_grace_until).toBeTruthy()

        const entitlementWrite = writes.find((w) => w.table === "workspace_entitlements")
        expect(entitlementWrite?.payload).toMatchObject({ plan_tier: "free", developer_api_enabled: false })
    })
})

describe("out-of-order and edge-case protection", () => {
    it("skips events older than the last applied subscription event", async () => {
        const { admin, writes } = createFakeAdmin({
            readResults: { workspace_subscriptions: { last_stripe_event_at: "2026-07-02T12:00:10+00:00" } },
        })

        const outcome = await syncSubscription(admin, "ws-1", subscriptionObject(), Math.floor(Date.parse("2026-07-02T12:00:00Z") / 1000))
        expect(outcome).toBe("stale_event")
        expect(writes.some((w) => w.op === "upsert" && w.table === "workspace_subscriptions")).toBe(false)
    })

    it("applies same-second events (created + updated share a timestamp)", async () => {
        const { admin, writes } = createFakeAdmin({
            readResults: { workspace_subscriptions: { last_stripe_event_at: "2026-07-02T12:00:00+00:00" } },
        })

        const outcome = await syncSubscription(admin, "ws-1", subscriptionObject(), Math.floor(Date.parse("2026-07-02T12:00:00Z") / 1000))
        expect(outcome).toBe("applied")
        expect(writes.some((w) => w.op === "upsert" && w.table === "workspace_subscriptions")).toBe(true)
    })

    it("records the event timestamp on applied writes", async () => {
        const { admin, writes } = createFakeAdmin({})
        await syncSubscription(admin, "ws-1", subscriptionObject(), Math.floor(Date.parse("2026-07-02T12:00:00Z") / 1000))

        const write = writes.find((w) => w.table === "workspace_subscriptions")
        expect((write?.payload as Record<string, unknown>).last_stripe_event_at).toBe("2026-07-02T12:00:00.000Z")
    })

    it("treats a deleted workspace (FK violation) as skipped, not failed", async () => {
        const admin = {
            from(table: string) {
                return {
                    upsert() {
                        return {
                            then: (resolve: (value: unknown) => void) =>
                                resolve({ error: table === "workspace_subscriptions" ? { code: "23503", message: "fk violation" } : null }),
                        }
                    },
                    select() {
                        return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }
                    },
                }
            },
        } as unknown as SupabaseClient

        const outcome = await syncSubscription(admin, "ws-gone", subscriptionObject())
        expect(outcome).toBe("workspace_gone")
    })

    it("warns loudly when an active subscription uses an unmapped price", async () => {
        const warn = vi.spyOn(console, "error").mockImplementation(() => undefined)
        const { admin } = createFakeAdmin({})
        await syncSubscription(admin, "ws-1", subscriptionObject({
            items: { data: [{ price: { id: "price_not_configured" } }] },
        }))

        expect(warn).toHaveBeenCalledWith(expect.stringContaining("unmapped price"))
        warn.mockRestore()
    })
})

describe("processStripeEvent", () => {
    it("skips unhandled event types", async () => {
        const { admin } = createFakeAdmin({})
        const result = await processStripeEvent(admin, {
            id: "evt_x",
            type: "invoice.finalized",
            data: { object: {} },
        })
        expect(result.status).toBe("skipped")
    })

    it("skips subscription events it cannot map to a workspace", async () => {
        const { admin } = createFakeAdmin({})
        const result = await processStripeEvent(admin, {
            id: "evt_y",
            type: "customer.subscription.updated",
            data: { object: { id: "sub_1", customer: "cus_unknown", status: "active", items: { data: [] } } },
        })
        expect(result.status).toBe("skipped")
        expect(result.workspaceId).toBeNull()
    })

    it("routes checkout completion via client_reference_id", async () => {
        const { admin, writes } = createFakeAdmin({})
        const result = await processStripeEvent(admin, {
            id: "evt_z",
            type: "checkout.session.completed",
            data: { object: { client_reference_id: "ws-9", customer: "cus_9" } },
        })
        expect(result).toMatchObject({ status: "processed", workspaceId: "ws-9" })
        expect(writes.find((w) => w.table === "workspace_billing_customers")?.payload).toMatchObject({
            workspace_id: "ws-9",
            stripe_customer_id: "cus_9",
        })
    })
})
