import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { BillingConfigError, getStripeClient } from "@/lib/billing/stripe"

export const runtime = "nodejs"

/**
 * Opens a Stripe Customer Portal session so the workspace owner can manage
 * the subscription (plan changes, payment methods, cancellation) self-service.
 */
export async function POST() {
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
            scope: "billing:portal",
            subject: user.id,
            limit: 10,
            windowSeconds: 300,
        })
        if (!rate.allowed) {
            return NextResponse.json({ error: "Too many billing requests, try again shortly" }, { status: 429 })
        }

        const admin = createAdminClient()
        const { data: customer, error: customerError } = await admin
            .from("workspace_billing_customers")
            .select("stripe_customer_id")
            .eq("workspace_id", workspace.id)
            .maybeSingle()

        if (customerError) {
            console.error("[billing] portal customer lookup failed:", redactSensitiveLogValue(customerError))
            return NextResponse.json({ error: "Failed to load billing account" }, { status: 500 })
        }
        if (!customer?.stripe_customer_id) {
            return NextResponse.json({ error: "This workspace has no billing account yet" }, { status: 404 })
        }

        const stripe = getStripeClient()
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
        const session = await stripe.billingPortal.sessions.create({
            customer: customer.stripe_customer_id,
            return_url: `${appUrl}/dashboard/settings`,
        })

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

        console.error("[billing] portal error:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 })
    }
}
