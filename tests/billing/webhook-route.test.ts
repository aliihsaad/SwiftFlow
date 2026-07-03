import { NextRequest } from "next/server"
import Stripe from "stripe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Route-level verification of the Stripe webhook receiver using Stripe's own
 * test-header signer, so the raw-body signature path is exercised exactly as
 * Stripe would call it (an offline stand-in for `stripe listen` test-mode
 * verification, which needs account credentials this environment lacks).
 */

const WEBHOOK_SECRET = "whsec_test_secret"

const state = vi.hoisted(() => ({
    writes: [] as Array<{ table: string; op: string; payload: unknown }>,
    upsertReturns: {} as Record<string, unknown[]>,
    readResults: {} as Record<string, unknown>,
}))

vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            return {
                upsert(payload: unknown) {
                    state.writes.push({ table, op: "upsert", payload })
                    return {
                        select: () => Promise.resolve({ data: state.upsertReturns[table] ?? [{ id: "row" }], error: null }),
                        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
                    }
                },
                update(payload: unknown) {
                    state.writes.push({ table, op: "update", payload })
                    return { eq: () => Promise.resolve({ error: null }) }
                },
                select() {
                    return {
                        eq: () => ({
                            maybeSingle: () => Promise.resolve({ data: state.readResults[table] ?? null, error: null }),
                        }),
                    }
                },
            }
        },
    }),
}))

import { POST } from "@/app/api/billing/webhook/route"

const stripe = new Stripe("sk_test_dummy")

function signedRequest(payload: string, signature?: string): NextRequest {
    const header = signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
    return new NextRequest("https://app.example.test/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": header, "content-type": "application/json" },
        body: payload,
    })
}

const subscriptionEvent = JSON.stringify({
    id: "evt_route_test",
    object: "event",
    type: "customer.subscription.updated",
    data: {
        object: {
            id: "sub_route",
            object: "subscription",
            customer: "cus_route",
            status: "active",
            cancel_at_period_end: false,
            metadata: { workspace_id: "ws-route" },
            items: { data: [{ price: { id: "price_pro_m" }, current_period_start: 1780000000, current_period_end: 1782592000 }] },
        },
    },
})

beforeEach(() => {
    state.writes = []
    state.upsertReturns = {}
    state.readResults = {}
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m"
    vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_PRICE_PRO_MONTHLY
    vi.restoreAllMocks()
})

describe("POST /api/billing/webhook", () => {
    it("accepts a correctly signed event and syncs the subscription", async () => {
        const response = await POST(signedRequest(subscriptionEvent))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({ received: true, status: "processed" })

        const subscriptionWrite = state.writes.find((w) => w.table === "workspace_subscriptions")
        expect(subscriptionWrite?.payload).toMatchObject({ workspace_id: "ws-route", plan_tier: "pro", status: "active" })

        const eventMark = state.writes.filter((w) => w.table === "stripe_webhook_events" && w.op === "update").pop()
        expect(eventMark?.payload).toMatchObject({ status: "processed", workspace_id: "ws-route" })
    })

    it("rejects a tampered or foreign signature with 400 and writes nothing", async () => {
        const badSignature = stripe.webhooks.generateTestHeaderString({
            payload: subscriptionEvent,
            secret: "whsec_wrong_secret",
        })
        const response = await POST(signedRequest(subscriptionEvent, badSignature))

        expect(response.status).toBe(400)
        expect(state.writes).toHaveLength(0)
    })

    it("rejects requests without a signature header", async () => {
        const request = new NextRequest("https://app.example.test/api/billing/webhook", {
            method: "POST",
            body: subscriptionEvent,
        })
        const response = await POST(request)
        expect(response.status).toBe(400)
    })

    it("returns duplicate for an already processed event without reprocessing", async () => {
        state.upsertReturns.stripe_webhook_events = []
        state.readResults.stripe_webhook_events = { status: "processed" }

        const response = await POST(signedRequest(subscriptionEvent))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({ received: true, duplicate: true })
        expect(state.writes.find((w) => w.table === "workspace_subscriptions")).toBeUndefined()
    })

    it("returns 503 when webhook secrets are not configured", async () => {
        delete process.env.STRIPE_WEBHOOK_SECRET
        const response = await POST(signedRequest(subscriptionEvent, "sig_irrelevant"))
        expect(response.status).toBe(503)
    })
})
