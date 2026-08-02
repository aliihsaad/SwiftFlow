import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  WebhookInboxEnqueueResult,
  WebhookInboxEvent,
  WebhookInboxStore,
} from "@/lib/webhooks/inbox-contract"

interface WebhookInboxRow {
  provider: WebhookInboxEvent["provider"]
  provider_event_key: string
  provider_object: WebhookInboxEvent["providerObject"]
  event_type: string
  account_external_id: string | null
  delivery_hash: string
  payload: Record<string, unknown>
}

function toRow(event: WebhookInboxEvent): WebhookInboxRow {
  return {
    provider: event.provider,
    provider_event_key: event.providerEventKey,
    provider_object: event.providerObject,
    event_type: event.eventType,
    account_external_id: event.accountExternalId,
    delivery_hash: event.deliveryHash,
    payload: event.payload,
  }
}

export function createSupabaseWebhookInboxStore(client: SupabaseClient): WebhookInboxStore {
  return {
    async enqueue(events): Promise<WebhookInboxEnqueueResult> {
      const { data, error } = await client
        .from("webhook_inbox_events")
        .upsert(events.map(toRow), {
          onConflict: "provider,provider_event_key",
          ignoreDuplicates: true,
        })
        .select("provider_event_key")

      if (error) {
        throw new Error(`Webhook inbox insert failed: ${error.message}`)
      }

      const inserted = data?.length || 0
      return {
        total: events.length,
        inserted,
        duplicates: events.length - inserted,
      }
    },
  }
}
