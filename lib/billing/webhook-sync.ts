import type { SupabaseClient } from "@supabase/supabase-js"
import { resolvePlanTierFromPriceId, PLAN_LIMITS, type PlanTier } from "./plans"

/**
 * Stripe webhook processing, factored out of the route for unit testing.
 * All writes use the service-role client; Stripe webhooks are the source of
 * truth for workspace_subscriptions and subscription-driven entitlements.
 */

const DOWNGRADE_GRACE_DAYS = 14

export type StripeEventLike = {
    id: string
    type: string
    /** Unix seconds; used to reject out-of-order (delayed/retried) events. */
    created?: number
    data: { object: Record<string, unknown> }
}

export type WebhookEventClaim = "new" | "duplicate"

/**
 * Idempotency gate: claims the event id in stripe_webhook_events.
 * Returns "duplicate" when the event was already processed or skipped;
 * previously failed events are reclaimed so Stripe retries can heal them.
 */
export async function claimWebhookEvent(admin: SupabaseClient, event: StripeEventLike): Promise<WebhookEventClaim> {
    const { data: inserted, error } = await admin
        .from("stripe_webhook_events")
        .upsert(
            { id: event.id, event_type: event.type, payload: event.data.object, status: "received" },
            { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id")

    if (error) {
        throw new Error(`Failed to record webhook event: ${error.message}`)
    }
    if (inserted && inserted.length > 0) return "new"

    // Conflict: reprocess only if the previous attempt failed.
    const { data: existing, error: readError } = await admin
        .from("stripe_webhook_events")
        .select("status")
        .eq("id", event.id)
        .maybeSingle()

    if (readError) {
        throw new Error(`Failed to read webhook event state: ${readError.message}`)
    }
    if (existing?.status === "failed") {
        await admin.from("stripe_webhook_events").update({ status: "received", error: null }).eq("id", event.id)
        return "new"
    }
    return "duplicate"
}

export async function markWebhookEvent(
    admin: SupabaseClient,
    eventId: string,
    status: "processed" | "skipped" | "failed",
    detail?: { workspaceId?: string | null; error?: string },
): Promise<void> {
    await admin
        .from("stripe_webhook_events")
        .update({
            status,
            processed_at: new Date().toISOString(),
            workspace_id: detail?.workspaceId ?? null,
            error: detail?.error ?? null,
        })
        .eq("id", eventId)
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value ? value : null
}

function unixToIso(value: unknown): string | null {
    return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null
}

function readMetadataWorkspaceId(object: Record<string, unknown>): string | null {
    const metadata = object.metadata
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        return asString((metadata as Record<string, unknown>).workspace_id)
    }
    return null
}

function readCustomerId(object: Record<string, unknown>): string | null {
    const customer = object.customer
    if (typeof customer === "string") return customer || null
    if (customer && typeof customer === "object") {
        return asString((customer as Record<string, unknown>).id)
    }
    return null
}

/** Resolves the workspace for a Stripe object via metadata, then the customer mapping. */
export async function resolveWorkspaceId(
    admin: SupabaseClient,
    object: Record<string, unknown>,
): Promise<string | null> {
    const fromMetadata = readMetadataWorkspaceId(object)
    if (fromMetadata) return fromMetadata

    const clientReference = asString(object.client_reference_id)
    if (clientReference) return clientReference

    const customerId = readCustomerId(object)
    if (!customerId) return null

    const { data } = await admin
        .from("workspace_billing_customers")
        .select("workspace_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle()

    return data?.workspace_id ?? null
}

type SubscriptionFields = {
    subscriptionId: string | null
    customerId: string | null
    priceId: string | null
    status: string
    cancelAtPeriodEnd: boolean
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    trialEnd: string | null
}

/**
 * Extracts the fields we persist from a Stripe subscription object.
 * Newer Stripe API versions moved current_period_start/end onto the
 * subscription item, so both locations are checked.
 */
export function extractSubscriptionFields(object: Record<string, unknown>): SubscriptionFields {
    const items = object.items as Record<string, unknown> | undefined
    const itemData = Array.isArray(items?.data) ? (items?.data as Record<string, unknown>[]) : []
    const firstItem = itemData[0]
    const price = firstItem?.price as Record<string, unknown> | undefined

    const knownStatuses = [
        "incomplete", "incomplete_expired", "trialing", "active",
        "past_due", "canceled", "unpaid", "paused",
    ]
    const rawStatus = asString(object.status) || "none"

    return {
        subscriptionId: asString(object.id),
        customerId: readCustomerId(object),
        priceId: asString(price?.id),
        status: knownStatuses.includes(rawStatus) ? rawStatus : "none",
        cancelAtPeriodEnd: object.cancel_at_period_end === true,
        currentPeriodStart: unixToIso(firstItem?.current_period_start) ?? unixToIso(object.current_period_start),
        currentPeriodEnd: unixToIso(firstItem?.current_period_end) ?? unixToIso(object.current_period_end),
        trialEnd: unixToIso(object.trial_end),
    }
}

/**
 * Syncs entitlements from a subscription change. Workspaces with a manual
 * entitlement source are never overwritten by billing events.
 */
async function syncEntitlementsForTier(admin: SupabaseClient, workspaceId: string, tier: PlanTier): Promise<void> {
    const { data: existing, error: readError } = await admin
        .from("workspace_entitlements")
        .select("entitlement_source")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    if (readError) {
        throw new Error(`Failed to read entitlements: ${readError.message}`)
    }
    if (existing?.entitlement_source === "manual") return

    const limits = PLAN_LIMITS[tier]
    const { error } = await admin
        .from("workspace_entitlements")
        .upsert(
            {
                workspace_id: workspaceId,
                plan_tier: tier,
                entitlement_source: "subscription",
                developer_api_enabled: limits.developerApiEnabled,
                deep_trend_reports_enabled: limits.deepTrendReportsEnabled,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id" },
        )

    if (error) {
        throw new Error(`Failed to sync entitlements: ${error.message}`)
    }
}

export type SubscriptionSyncOutcome = "applied" | "stale_event" | "workspace_gone"

function unixToIsoOrNull(created: number | undefined): string | null {
    return typeof created === "number" && Number.isFinite(created) ? new Date(created * 1000).toISOString() : null
}

/**
 * Returns true when a newer Stripe event has already written this workspace's
 * subscription row. Stripe retries and parallel deliveries can arrive out of
 * order; older events must never overwrite newer state.
 */
async function isStaleSubscriptionEvent(
    admin: SupabaseClient,
    workspaceId: string,
    eventCreatedAt: string | null,
): Promise<boolean> {
    if (!eventCreatedAt) return false
    const { data } = await admin
        .from("workspace_subscriptions")
        .select("last_stripe_event_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    // Strictly newer only: created/updated events from the same checkout often
    // share a timestamp, and same-second events must still apply (the ledger
    // already dedupes exact event-id replays). Compare as instants because
    // Postgres and JS render timezone suffixes differently.
    if (!data?.last_stripe_event_at) return false
    return new Date(data.last_stripe_event_at).getTime() > new Date(eventCreatedAt).getTime()
}

/** Postgres foreign-key violation: the workspace was deleted mid-flight. */
function isWorkspaceGoneError(error: { code?: string } | null): boolean {
    return error?.code === "23503"
}

/** Handles customer.subscription.created / customer.subscription.updated. */
export async function syncSubscription(
    admin: SupabaseClient,
    workspaceId: string,
    object: Record<string, unknown>,
    eventCreated?: number,
): Promise<SubscriptionSyncOutcome> {
    const eventCreatedAt = unixToIsoOrNull(eventCreated)
    if (await isStaleSubscriptionEvent(admin, workspaceId, eventCreatedAt)) {
        return "stale_event"
    }

    const fields = extractSubscriptionFields(object)
    const tier = resolvePlanTierFromPriceId(fields.priceId)

    // A paying subscription on a price we cannot map means the STRIPE_PRICE_*
    // env config is out of sync with the Stripe account — surface it loudly
    // instead of silently treating the customer as free tier.
    if (tier === "free" && fields.priceId && ["active", "trialing", "past_due"].includes(fields.status)) {
        console.error(
            `[billing] subscription ${fields.subscriptionId} uses unmapped price ${fields.priceId}; ` +
            "check STRIPE_PRICE_* env configuration",
        )
    }

    const { error } = await admin
        .from("workspace_subscriptions")
        .upsert(
            {
                workspace_id: workspaceId,
                stripe_subscription_id: fields.subscriptionId,
                stripe_customer_id: fields.customerId,
                stripe_price_id: fields.priceId,
                plan_tier: tier,
                status: fields.status,
                cancel_at_period_end: fields.cancelAtPeriodEnd,
                current_period_start: fields.currentPeriodStart,
                current_period_end: fields.currentPeriodEnd,
                trial_end: fields.trialEnd,
                downgrade_grace_until: null,
                last_stripe_event_at: eventCreatedAt,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id" },
        )

    if (error) {
        if (isWorkspaceGoneError(error)) return "workspace_gone"
        throw new Error(`Failed to sync subscription: ${error.message}`)
    }

    await syncEntitlementsForTier(admin, workspaceId, tier)
    return "applied"
}

/**
 * Handles customer.subscription.deleted: keeps the last paid tier recorded but
 * marks the subscription canceled and opens a downgrade grace window before
 * retention/entitlement downgrades take effect.
 */
export async function handleSubscriptionDeleted(
    admin: SupabaseClient,
    workspaceId: string,
    object: Record<string, unknown>,
    eventCreated?: number,
): Promise<SubscriptionSyncOutcome> {
    const eventCreatedAt = unixToIsoOrNull(eventCreated)
    if (await isStaleSubscriptionEvent(admin, workspaceId, eventCreatedAt)) {
        return "stale_event"
    }

    const fields = extractSubscriptionFields(object)
    const graceUntil = new Date(Date.now() + DOWNGRADE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await admin
        .from("workspace_subscriptions")
        .upsert(
            {
                workspace_id: workspaceId,
                stripe_subscription_id: fields.subscriptionId,
                stripe_customer_id: fields.customerId,
                stripe_price_id: fields.priceId,
                plan_tier: resolvePlanTierFromPriceId(fields.priceId),
                status: "canceled",
                cancel_at_period_end: false,
                current_period_end: fields.currentPeriodEnd,
                downgrade_grace_until: graceUntil,
                last_stripe_event_at: eventCreatedAt,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id" },
        )

    if (error) {
        if (isWorkspaceGoneError(error)) return "workspace_gone"
        throw new Error(`Failed to record subscription cancellation: ${error.message}`)
    }

    await syncEntitlementsForTier(admin, workspaceId, "free")
    return "applied"
}

/** Handles checkout.session.completed: persists the customer mapping early. */
export async function handleCheckoutCompleted(
    admin: SupabaseClient,
    workspaceId: string,
    object: Record<string, unknown>,
): Promise<void> {
    const customerId = readCustomerId(object)
    if (!customerId) return

    const { error } = await admin
        .from("workspace_billing_customers")
        .upsert(
            { workspace_id: workspaceId, stripe_customer_id: customerId },
            { onConflict: "workspace_id", ignoreDuplicates: true },
        )

    if (error) {
        throw new Error(`Failed to save customer mapping: ${error.message}`)
    }
}

export type ProcessResult = { status: "processed" | "skipped"; workspaceId: string | null }

/** Routes a verified Stripe event to its handler. */
export async function processStripeEvent(admin: SupabaseClient, event: StripeEventLike): Promise<ProcessResult> {
    const object = event.data.object

    switch (event.type) {
        case "checkout.session.completed": {
            const workspaceId = await resolveWorkspaceId(admin, object)
            if (!workspaceId) return { status: "skipped", workspaceId: null }
            await handleCheckoutCompleted(admin, workspaceId, object)
            return { status: "processed", workspaceId }
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
            const workspaceId = await resolveWorkspaceId(admin, object)
            if (!workspaceId) return { status: "skipped", workspaceId: null }
            const outcome = await syncSubscription(admin, workspaceId, object, event.created)
            return { status: outcome === "applied" ? "processed" : "skipped", workspaceId }
        }
        case "customer.subscription.deleted": {
            const workspaceId = await resolveWorkspaceId(admin, object)
            if (!workspaceId) return { status: "skipped", workspaceId: null }
            const outcome = await handleSubscriptionDeleted(admin, workspaceId, object, event.created)
            return { status: outcome === "applied" ? "processed" : "skipped", workspaceId }
        }
        default:
            return { status: "skipped", workspaceId: null }
    }
}
