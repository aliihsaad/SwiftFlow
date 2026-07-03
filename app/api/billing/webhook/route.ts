import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { createAdminClient } from "@/utils/supabase/admin"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { BillingConfigError, getStripeClient, getStripeWebhookSecret } from "@/lib/billing/stripe"
import {
    claimWebhookEvent,
    markWebhookEvent,
    processStripeEvent,
    type StripeEventLike,
} from "@/lib/billing/webhook-sync"

export const runtime = "nodejs"

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024

/**
 * Stripe webhook receiver. Verifies the signature against the raw request
 * body, then applies each event exactly once via the stripe_webhook_events
 * idempotency ledger. Processing failures return 500 so Stripe retries;
 * retried events are reclaimed because their status is 'failed'.
 */
export async function POST(request: NextRequest) {
    let secret: string
    let stripe: Stripe
    try {
        secret = getStripeWebhookSecret()
        stripe = getStripeClient()
    } catch (error) {
        if (error instanceof BillingConfigError) {
            return NextResponse.json({ error: error.message }, { status: 503 })
        }
        throw error
    }

    const signature = request.headers.get("stripe-signature")
    if (!signature) {
        return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
    }

    const contentLength = Number(request.headers.get("content-length") || "0")
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    // Signature verification requires the exact raw body bytes.
    const rawBody = await request.text()
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch (error) {
        console.error("[billing] webhook signature verification failed:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    const admin = createAdminClient()
    const eventLike = event as unknown as StripeEventLike

    try {
        const claim = await claimWebhookEvent(admin, eventLike)
        if (claim === "duplicate") {
            return NextResponse.json({ received: true, duplicate: true })
        }
    } catch (error) {
        console.error("[billing] webhook idempotency check failed:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Failed to record event" }, { status: 500 })
    }

    try {
        const result = await processStripeEvent(admin, eventLike)
        await markWebhookEvent(admin, event.id, result.status, { workspaceId: result.workspaceId })
        return NextResponse.json({ received: true, status: result.status })
    } catch (error) {
        console.error("[billing] webhook processing failed:", redactSensitiveLogValue(error))
        await markWebhookEvent(admin, event.id, "failed", {
            error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        })
        return NextResponse.json({ error: "Event processing failed" }, { status: 500 })
    }
}
