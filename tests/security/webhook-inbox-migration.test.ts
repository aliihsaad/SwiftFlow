import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260726190000_add_durable_webhook_inbox.sql",
  ),
  "utf8",
)
const route = readFileSync(
  path.join(process.cwd(), "app", "api", "webhooks", "instagram", "route.ts"),
  "utf8",
)

describe("durable webhook inbox migration", () => {
  it("enforces provider-event uniqueness and bounded worker attempts", () => {
    expect(migration).toContain("unique (provider, provider_event_key)")
    expect(migration).toContain("attempt_count <= max_attempts")
    expect(migration).toContain("result jsonb not null")
    expect(migration).toContain("'dead_letter'")
  })

  it("claims events atomically with expiring leases", () => {
    expect(migration).toContain("for update skip locked")
    expect(migration).toContain("lock_expires_at <= now()")
    expect(migration).toContain("attempt_count = event.attempt_count + 1")
    expect(migration).toContain("make_interval")
    expect(migration).toContain("lease_expired_after_final_attempt")
  })

  it("keeps the inbox private and avoids storing webhook signatures", () => {
    expect(migration).toContain("enable row level security")
    expect(migration).toContain("revoke all on table public.webhook_inbox_events from public")
    expect(migration).not.toMatch(/signature\s+text/i)
  })

  it("keeps shadow capture behind signature verification and before legacy processing", () => {
    const signatureCheck = route.indexOf("crypto.timingSafeEqual")
    const shadowCapture = route.indexOf("await enqueueMetaWebhookDelivery(")
    const legacyProcessing = route.indexOf("await processWebhookEvents(body)")

    expect(route).toContain("process.env.WEBHOOK_INBOX_SHADOW_ENABLED")
    expect(signatureCheck).toBeGreaterThan(-1)
    expect(shadowCapture).toBeGreaterThan(signatureCheck)
    expect(legacyProcessing).toBeGreaterThan(shadowCapture)
    expect(route).toContain("continuing synchronous processing")
  })
})
