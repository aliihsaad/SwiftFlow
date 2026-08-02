import { request as httpRequest } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import {
  assertWebhookIngressDatabaseAccess,
  assertWebhookIngressDatabaseReady,
  resolveWebhookIngressConfig,
  type WebhookIngressConfig,
  type WebhookIngressEnvironment,
} from "../lib/webhooks/ingress-runtime"
import { createPostgresQueryClient } from "../lib/webhooks/postgres-inbox-repository"

const HEALTH_REQUEST_TIMEOUT_MS = 5_000

/** Wildcard bind addresses are not connectable; probe the loopback instead. */
function loopbackHost(host: string): string {
  if (host === "0.0.0.0" || host === "") return "127.0.0.1"
  if (host === "::" || host === "[::]") return "::1"
  return host
}

export function probeWebhookIngressHealth(
  config: WebhookIngressConfig,
): Promise<void> {
  return new Promise((resolveProbe, rejectProbe) => {
    const probe = httpRequest(
      {
        host: loopbackHost(config.host),
        port: config.port,
        path: config.healthPath,
        method: "GET",
        timeout: HEALTH_REQUEST_TIMEOUT_MS,
      },
      (response) => {
        response.resume()
        if (response.statusCode === 200) {
          resolveProbe()
          return
        }
        rejectProbe(
          new Error(`Webhook ingress health returned status ${response.statusCode}`),
        )
      },
    )

    probe.once("timeout", () => {
      probe.destroy(new Error("Webhook ingress health check timed out"))
    })
    probe.once("error", rejectProbe)
    probe.end()
  })
}

export async function runWebhookIngressHealthcheck(
  environment: WebhookIngressEnvironment = process.env,
): Promise<void> {
  const config = resolveWebhookIngressConfig(environment)
  const pool = createPostgresPool(environment)

  try {
    const database = createPostgresQueryClient(pool)
    await assertWebhookIngressDatabaseReady(database)
    await assertWebhookIngressDatabaseAccess(database)
  } finally {
    await pool.end()
  }

  await probeWebhookIngressHealth(config)
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runWebhookIngressHealthcheck().catch((error) => {
    console.error("[WEBHOOK_INGRESS] Healthcheck failed", {
      message: error instanceof Error ? error.message : "Unknown healthcheck failure",
    })
    process.exitCode = 1
  })
}
