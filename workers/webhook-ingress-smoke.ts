import crypto from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Deployment smoke for the append-only ingress.
 *
 * It drives the ingress exactly as Meta would - handshake, unsigned rejection,
 * signed delivery, and replay - using a fully synthetic payload. It never calls
 * a provider API and never needs database access of its own.
 */

const SMOKE_ENTRY_ID = "17841400000000000"
const SMOKE_COMMENT_ID = "staging-ingress-smoke-1"

export const SMOKE_PROVIDER_EVENT_KEY =
  `instagram:${SMOKE_ENTRY_ID}:change:comments:${SMOKE_COMMENT_ID}`

interface SmokeResponse {
  status: number
  body: string
}

function requiredEnvironment(name: string, environment: NodeJS.ProcessEnv): string {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required for the ingress smoke run`)
  return value
}

function syntheticDelivery(): string {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: SMOKE_ENTRY_ID,
        time: 1_700_000_000,
        changes: [
          {
            field: "comments",
            value: {
              id: SMOKE_COMMENT_ID,
              text: "Please send the SwiftFlow details",
              from: {
                id: "staging-ingress-smoke-author",
                username: "staging_tester",
                self_ig_scoped_id: "staging-ingress-smoke-author",
              },
              media: {
                id: "staging-ingress-smoke-media",
                media_product_type: "FEED",
              },
              parent_id: "staging-ingress-smoke-parent",
            },
          },
        ],
      },
    ],
  })
}

async function send(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<SmokeResponse> {
  const response = await fetch(url, init)
  return { status: response.status, body: await response.text() }
}

function expectStatus(label: string, response: SmokeResponse, expected: number): void {
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected status ${expected}, received ${response.status}`,
    )
  }
}

function enqueueCounts(response: SmokeResponse): { inserted: number; duplicates: number } {
  const parsed = JSON.parse(response.body) as Record<string, unknown>
  return {
    inserted: Number(parsed.inserted) || 0,
    duplicates: Number(parsed.duplicates) || 0,
  }
}

export async function runWebhookIngressSmoke(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const deliveryUrl =
    environment.WEBHOOK_INGRESS_SMOKE_URL?.trim()
    || "http://webhook-ingress:8080/webhooks/meta"
  const verifyToken = requiredEnvironment("META_WEBHOOK_VERIFY_TOKEN", environment)
  const appSecret = requiredEnvironment("INSTAGRAM_APP_SECRET", environment)

  const challenge = crypto.randomBytes(8).toString("hex")
  const handshakeUrl = new URL(deliveryUrl)
  handshakeUrl.searchParams.set("hub.mode", "subscribe")
  handshakeUrl.searchParams.set("hub.verify_token", verifyToken)
  handshakeUrl.searchParams.set("hub.challenge", challenge)

  const handshake = await send(handshakeUrl.toString(), { method: "GET" })
  expectStatus("handshake", handshake, 200)
  if (handshake.body !== challenge) {
    throw new Error("handshake: ingress did not echo the challenge")
  }

  const wrongTokenUrl = new URL(handshakeUrl)
  wrongTokenUrl.searchParams.set("hub.verify_token", `${verifyToken}-wrong`)
  expectStatus("handshake with wrong token", await send(wrongTokenUrl.toString(), {
    method: "GET",
  }), 403)

  const body = syntheticDelivery()
  const signature =
    `sha256=${crypto.createHmac("sha256", appSecret).update(body).digest("hex")}`

  expectStatus("unsigned delivery", await send(deliveryUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }), 401)

  expectStatus("tampered signature", await send(deliveryUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
    },
    body,
  }), 401)

  const signedHeaders = {
    "content-type": "application/json",
    "x-hub-signature-256": signature,
  }

  const first = await send(deliveryUrl, { method: "POST", headers: signedHeaders, body })
  expectStatus("signed delivery", first, 200)
  const firstCounts = enqueueCounts(first)

  const replay = await send(deliveryUrl, { method: "POST", headers: signedHeaders, body })
  expectStatus("replayed delivery", replay, 200)
  const replayCounts = enqueueCounts(replay)

  if (replayCounts.inserted !== 0 || replayCounts.duplicates !== 1) {
    throw new Error(
      `replayed delivery was not deduplicated: inserted=${replayCounts.inserted} duplicates=${replayCounts.duplicates}`,
    )
  }

  console.info("[WEBHOOK_INGRESS_SMOKE] Verified", {
    deliveryUrl,
    providerEventKey: SMOKE_PROVIDER_EVENT_KEY,
    firstInserted: firstCounts.inserted,
    firstDuplicates: firstCounts.duplicates,
    replayInserted: replayCounts.inserted,
    replayDuplicates: replayCounts.duplicates,
  })
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runWebhookIngressSmoke().catch((error) => {
    console.error("[WEBHOOK_INGRESS_SMOKE] Failed", {
      message: error instanceof Error ? error.message : "Unknown smoke failure",
    })
    process.exitCode = 1
  })
}
