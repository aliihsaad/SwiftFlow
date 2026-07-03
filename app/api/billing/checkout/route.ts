import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { BillingConfigError, getOrCreateStripeCustomer, getStripeClient } from "@/lib/billing/stripe"
import { getConfiguredPriceId, isCheckoutBlockedByStatus, type BillingInterval, type PaidPlanTier } from "@/lib/billing/plans"

export const runtime = "nodejs"

function parseCheckoutPayload(body: unknown): { plan: PaidPlanTier; interval: BillingInterval } {
    const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
    const plan = record.plan === "agency" ? "agency" : record.plan === "pro" ? "pro" : null
    if (!plan) throw new Error("plan must be 'pro' or 'agency'")
    const interval: BillingInterval = record.interval === "year" ? "year" : "month"
    return { plan, interval }
}

/**
 * Starts a Stripe Checkout Session (mode=subscription) for the active
 * workspace. Owner-only; price IDs come from server config, never the client.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const workspace = await getExplicitActiveWorkspace()
        if (!workspace) {
            return NextResponse.json({ error: "No active workspace selected" }, { status: 400 })
        }

        await requireWorkspacePermission(supabase, user.id, workspace.id, "billing:manage")

        const rate = await consumeRateLimit({
            scope: "billing:checkout",
            subject: user.id,
            limit: 10,
            windowSeconds: 300,
        })
        if (!rate.allowed) {
            return NextResponse.json({ error: "Too many billing requests, try again shortly" }, { status: 429 })
        }

        try {
            assertJsonBodySize(request, 4 * 1024)
        } catch {
            return NextResponse.json({ error: "Request payload too large" }, { status: 400 })
        }

        let payload
        try {
            payload = parseCheckoutPayload(await request.json().catch(() => ({})))
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid plan" }, { status: 400 })
        }

        const priceId = getConfiguredPriceId(payload.plan, payload.interval)
        if (!priceId) {
            return NextResponse.json(
                { error: `The ${payload.plan} (${payload.interval}ly) plan is not available yet` },
                { status: 503 },
            )
        }

        const stripe = getStripeClient()
        const admin = createAdminClient()

        // A live subscription must be changed through the Customer Portal;
        // a second Checkout would create a duplicate Stripe subscription.
        const { data: existingSubscription, error: subscriptionError } = await admin
            .from("workspace_subscriptions")
            .select("status")
            .eq("workspace_id", workspace.id)
            .maybeSingle()
        if (subscriptionError) {
            console.error("[billing] checkout subscription lookup failed:", redactSensitiveLogValue(subscriptionError))
            return NextResponse.json({ error: "Failed to check subscription state" }, { status: 500 })
        }
        if (isCheckoutBlockedByStatus(existingSubscription?.status)) {
            return NextResponse.json(
                {
                    error: "This workspace already has an active subscription. Use 'Manage billing' to change plans.",
                    code: "subscription_exists",
                },
                { status: 409 },
            )
        }

        const customerId = await getOrCreateStripeCustomer(admin, stripe, workspace, user.email)

        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: workspace.id,
            metadata: { workspace_id: workspace.id },
            subscription_data: { metadata: { workspace_id: workspace.id } },
            allow_promotion_codes: true,
            success_url: `${appUrl}/dashboard/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/dashboard/settings?billing=cancelled`,
        })

        if (!session.url) {
            return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 502 })
        }

        return NextResponse.json({ url: session.url })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : "Forbidden" },
                { status: permissionStatus },
            )
        }
        if (error instanceof BillingConfigError) {
            return NextResponse.json({ error: error.message }, { status: 503 })
        }

        console.error("[billing] checkout error:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 })
    }
}
