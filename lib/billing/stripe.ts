import "server-only"
import Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Thrown when a billing action is attempted without Stripe configuration. */
export class BillingConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "BillingConfigError"
    }
}

let cachedClient: Stripe | null = null

export function isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

export function getStripeClient(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (!secretKey) {
        throw new BillingConfigError("Billing is not configured (missing STRIPE_SECRET_KEY)")
    }
    if (!cachedClient) {
        cachedClient = new Stripe(secretKey)
    }
    return cachedClient
}

export function getStripeWebhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!secret) {
        throw new BillingConfigError("Billing webhook is not configured (missing STRIPE_WEBHOOK_SECRET)")
    }
    return secret
}

/**
 * Returns the Stripe customer ID for a workspace, creating the customer and
 * the workspace_billing_customers mapping row on first use.
 */
export async function getOrCreateStripeCustomer(
    admin: SupabaseClient,
    stripe: Stripe,
    workspace: { id: string; name?: string | null },
    billingEmail: string | null | undefined,
): Promise<string> {
    const { data: existing, error: readError } = await admin
        .from("workspace_billing_customers")
        .select("stripe_customer_id")
        .eq("workspace_id", workspace.id)
        .maybeSingle()

    if (readError) {
        throw new Error(`Failed to load billing customer: ${readError.message}`)
    }
    if (existing?.stripe_customer_id) return existing.stripe_customer_id

    const customer = await stripe.customers.create({
        email: billingEmail || undefined,
        name: workspace.name || undefined,
        metadata: { workspace_id: workspace.id },
    })

    const { error: insertError } = await admin
        .from("workspace_billing_customers")
        .upsert(
            { workspace_id: workspace.id, stripe_customer_id: customer.id },
            { onConflict: "workspace_id", ignoreDuplicates: true },
        )

    if (insertError) {
        throw new Error(`Failed to save billing customer mapping: ${insertError.message}`)
    }

    // Re-read to survive a concurrent first-checkout race: whichever mapping
    // row landed first wins and is the one we bill against.
    const { data: settled } = await admin
        .from("workspace_billing_customers")
        .select("stripe_customer_id")
        .eq("workspace_id", workspace.id)
        .maybeSingle()

    return settled?.stripe_customer_id || customer.id
}
