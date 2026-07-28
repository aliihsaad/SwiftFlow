import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import type { WebhookInboxStore } from "../lib/webhooks/inbox-contract"
import {
  assertWebhookIngressDatabaseAccess,
  assertWebhookIngressDatabaseReady,
  handleWebhookIngressRequest,
  readBoundedRequestBody,
  resolveWebhookIngressConfig,
  type WebhookIngressConfig,
  type WebhookIngressEnvironment,
} from "../lib/webhooks/ingress-runtime"
import { createPostgresWebhookInboxStore } from "../lib/webhooks/postgres-inbox-store"
import { createPostgresQueryClient } from "../lib/webhooks/postgres-inbox-repository"

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown ingress failure"
  return message.replace(/\s+/g, " ").trim().slice(0, 1_000)
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function createWebhookIngressServer(
  config: WebhookIngressConfig,
  store: WebhookInboxStore,
): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    // The host header is attacker-controlled; only the path and query are used.
    const url = new URL(request.url || "/", "http://ingress.invalid")

    handleWebhookIngressRequest(config, store, {
      method: request.method || "GET",
      path: url.pathname.replace(/\/+$/, "") || "/",
      query: url.searchParams,
      signature: firstHeaderValue(request.headers["x-hub-signature-256"]),
      readBody: () => readBoundedRequestBody(request, config.maxBodyBytes),
    })
      .then((result) => {
        if (result.status >= 400) {
          console.warn("[WEBHOOK_INGRESS] Request rejected", {
            method: request.method,
            path: url.pathname,
            status: result.status,
            reason: result.reason,
          })
        }

        response.writeHead(result.status, {
          "content-type": result.contentType,
          "content-length": Buffer.byteLength(result.body),
          "cache-control": "no-store",
        })
        response.end(request.method === "HEAD" ? undefined : result.body)
      })
      .catch((error) => {
        console.error("[WEBHOOK_INGRESS] Request failed", {
          path: url.pathname,
          message: safeErrorMessage(error),
        })
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "application/json" })
        }
        response.end(JSON.stringify({ error: "Internal error" }))
      })
  })
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(port, host, () => {
      server.removeListener("error", rejectListen)
      resolveListen()
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose())
    server.closeIdleConnections?.()
  })
}

export async function runWebhookIngressProcess(
  environment: WebhookIngressEnvironment = process.env,
): Promise<void> {
  const config = resolveWebhookIngressConfig(environment)
  const pool = createPostgresPool(environment)
  const database = createPostgresQueryClient(pool)

  await assertWebhookIngressDatabaseReady(database)
  await assertWebhookIngressDatabaseAccess(database)

  const server = createWebhookIngressServer(
    config,
    createPostgresWebhookInboxStore(database),
  )
  // Slightly above Meta's delivery timeout so a slow client cannot pin a socket.
  server.headersTimeout = 20_000
  server.requestTimeout = 30_000

  await listen(server, config.host, config.port)
  console.info("[WEBHOOK_INGRESS] Listening", {
    host: config.host,
    port: config.port,
    deliveryPath: config.deliveryPath,
    healthPath: config.healthPath,
    maxBodyBytes: config.maxBodyBytes,
    configuredSecrets: config.appSecrets.length,
  })

  const stopped = new Promise<void>((resolveStopped) => {
    const shutdown = (signal: NodeJS.Signals) => {
      console.info("[WEBHOOK_INGRESS] Shutdown requested", { signal })
      resolveStopped()
    }
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
  })

  try {
    await stopped
  } finally {
    await close(server)
    await pool.end()
    console.info("[WEBHOOK_INGRESS] Stopped")
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runWebhookIngressProcess().catch((error) => {
    console.error("[WEBHOOK_INGRESS] Ingress stopped unexpectedly", {
      message: safeErrorMessage(error),
    })
    process.exitCode = 1
  })
}
