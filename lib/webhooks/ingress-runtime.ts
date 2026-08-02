import crypto from "node:crypto"

import { enqueueMetaWebhookDelivery } from "./inbox-contract"
import type { WebhookInboxStore } from "./inbox-contract"
import type { PostgresQueryClient } from "./postgres-inbox-repository"

export interface WebhookIngressEnvironment
  extends Readonly<Record<string, string | undefined>> {
  WEBHOOK_INGRESS_HOST?: string
  WEBHOOK_INGRESS_PORT?: string
  WEBHOOK_INGRESS_PATH?: string
  WEBHOOK_INGRESS_HEALTH_PATH?: string
  WEBHOOK_INGRESS_MAX_BODY_BYTES?: string
  META_WEBHOOK_VERIFY_TOKEN?: string
  META_APP_SECRET?: string
  INSTAGRAM_APP_SECRET?: string
}

export interface WebhookIngressConfig {
  host: string
  port: number
  deliveryPath: string
  healthPath: string
  maxBodyBytes: number
  verifyToken: string
  appSecrets: readonly string[]
}

export interface WebhookIngressRequest {
  method: string
  path: string
  query: URLSearchParams
  signature: string | null
  readBody: () => Promise<Buffer>
}

export interface WebhookIngressResponse {
  status: number
  contentType: string
  body: string
  /** Short, payload-free reason used for operator logs. */
  reason: string
}

export class WebhookIngressBodyTooLargeError extends Error {
  constructor() {
    super("Webhook payload exceeded the configured byte cap")
    this.name = "WebhookIngressBodyTooLargeError"
  }
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
const MAX_MAX_BODY_BYTES = 4 * 1024 * 1024

const DATABASE_READINESS_SQL = `
  select to_regclass('public.webhook_inbox_events')::text as inbox_table
`

const DATABASE_ACCESS_SQL = `
  select
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolreplication,
    role.rolbypassrls,
    has_schema_privilege(current_user, 'public', 'usage') as schema_usage,
    has_schema_privilege(current_user, 'public', 'create') as schema_create,
    (
      select bool_and(has_column_privilege(
        current_user,
        'public.webhook_inbox_events',
        required.column_name,
        'insert'
      ))
      from unnest(array[
        'provider',
        'provider_event_key',
        'provider_object',
        'event_type',
        'account_external_id',
        'delivery_hash',
        'payload'
      ]) as required(column_name)
    ) as inbox_required_inserts,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'select'
    ) as inbox_select,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'update'
    ) as inbox_update,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'delete'
    ) as inbox_delete,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'truncate'
    ) as inbox_truncate,
    has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      'payload',
      'select'
    ) as inbox_payload_select,
    (
      has_column_privilege(
        current_user,
        'public.webhook_inbox_events',
        'status',
        'insert'
      )
      or has_column_privilege(
        current_user,
        'public.webhook_inbox_events',
        'attempt_count',
        'insert'
      )
      or has_column_privilege(
        current_user,
        'public.webhook_inbox_events',
        'workspace_id',
        'insert'
      )
    ) as inbox_lifecycle_insert,
    has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      'status',
      'update'
    ) as inbox_status_update,
    has_function_privilege(
      current_user,
      'public.claim_webhook_inbox_events(text,integer,integer)',
      'execute'
    ) as claim_execute,
    (
      has_column_privilege(
        current_user,
        'public.social_accounts',
        'account_id',
        'select'
      )
      or has_column_privilege(
        current_user,
        'public.social_accounts',
        'access_token',
        'select'
      )
      or has_column_privilege(
        current_user,
        'public.social_accounts',
        'refresh_token',
        'select'
      )
    ) as social_accounts_select,
    has_column_privilege(
      current_user,
      'public.automations',
      'workflow_graph',
      'select'
    ) as automations_select,
    has_table_privilege(
      current_user,
      'public.workspaces',
      'select'
    ) as workspaces_select
  from pg_roles as role
  where role.rolname = current_user
`

const REQUIRED_DATABASE_ACCESS = [
  "schema_usage",
  "inbox_required_inserts",
] as const

const FORBIDDEN_DATABASE_ACCESS = [
  "rolsuper",
  "rolcreatedb",
  "rolcreaterole",
  "rolreplication",
  "rolbypassrls",
  "schema_create",
  "inbox_select",
  "inbox_update",
  "inbox_delete",
  "inbox_truncate",
  "inbox_payload_select",
  "inbox_lifecycle_insert",
  "inbox_status_update",
  "claim_execute",
  "social_accounts_select",
  "automations_select",
  "workspaces_select",
] as const

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

function normalizedPath(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "")
  return withoutTrailingSlash || fallback
}

export function resolveWebhookIngressConfig(
  environment: WebhookIngressEnvironment = process.env,
): WebhookIngressConfig {
  const verifyToken = environment.META_WEBHOOK_VERIFY_TOKEN?.trim()
  if (!verifyToken) {
    throw new Error(
      "META_WEBHOOK_VERIFY_TOKEN is required for the webhook ingress service",
    )
  }

  const appSecrets = [
    environment.INSTAGRAM_APP_SECRET?.trim(),
    environment.META_APP_SECRET?.trim(),
  ].filter((secret, index, all): secret is string =>
    Boolean(secret) && all.indexOf(secret) === index)

  if (appSecrets.length === 0) {
    throw new Error(
      "INSTAGRAM_APP_SECRET or META_APP_SECRET is required for the webhook ingress service",
    )
  }

  const deliveryPath = normalizedPath(
    environment.WEBHOOK_INGRESS_PATH,
    "/webhooks/meta",
  )
  const healthPath = normalizedPath(
    environment.WEBHOOK_INGRESS_HEALTH_PATH,
    "/healthz",
  )

  if (deliveryPath === healthPath) {
    throw new Error(
      "WEBHOOK_INGRESS_PATH and WEBHOOK_INGRESS_HEALTH_PATH must differ",
    )
  }

  return {
    host: environment.WEBHOOK_INGRESS_HOST?.trim() || "0.0.0.0",
    port: boundedInteger(environment.WEBHOOK_INGRESS_PORT, 8080, 1, 65_535),
    deliveryPath,
    healthPath,
    maxBodyBytes: boundedInteger(
      environment.WEBHOOK_INGRESS_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      1_024,
      MAX_MAX_BODY_BYTES,
    ),
    verifyToken,
    appSecrets,
  }
}

/** Constant-time comparison that tolerates differing lengths. */
function equalsSecurely(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) return false
  return crypto.timingSafeEqual(leftBytes, rightBytes)
}

export function verifyMetaWebhookSignature(
  appSecrets: readonly string[],
  signature: string | null,
  rawBody: Buffer,
): boolean {
  const received = signature?.trim()
  if (!received) return false

  return appSecrets.some((secret) => {
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`
    return equalsSecurely(received, expected)
  })
}

export function verifyMetaWebhookToken(
  configuredToken: string,
  presentedToken: string | null,
): boolean {
  return Boolean(presentedToken) && equalsSecurely(configuredToken, presentedToken as string)
}

function jsonResponse(
  status: number,
  reason: string,
  payload: Record<string, unknown>,
): WebhookIngressResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
    reason,
  }
}

function textResponse(
  status: number,
  reason: string,
  body: string,
): WebhookIngressResponse {
  return { status, contentType: "text/plain; charset=utf-8", body, reason }
}

/**
 * Meta's subscription handshake. The challenge is echoed only when the
 * presented token matches the configured verify token.
 */
export function handleWebhookVerification(
  config: WebhookIngressConfig,
  query: URLSearchParams,
): WebhookIngressResponse {
  const mode = query.get("hub.mode")
  const token = query.get("hub.verify_token")
  const challenge = query.get("hub.challenge")

  if (mode !== "subscribe" || !verifyMetaWebhookToken(config.verifyToken, token)) {
    return textResponse(403, "verification_token_mismatch", "Forbidden")
  }

  if (!challenge) {
    return textResponse(400, "verification_challenge_missing", "Missing challenge")
  }

  return textResponse(200, "verification_succeeded", challenge)
}

/**
 * Verifies a signed delivery and appends it to the durable inbox.
 *
 * The response is only a 2xx acknowledgement once every extracted event is
 * durably stored, so a persistence failure leaves the delivery eligible for
 * Meta's retry instead of silently dropping it.
 */
export async function handleWebhookDelivery(
  config: WebhookIngressConfig,
  store: WebhookInboxStore,
  request: Pick<WebhookIngressRequest, "signature" | "readBody">,
): Promise<WebhookIngressResponse> {
  if (!request.signature) {
    return jsonResponse(401, "signature_missing", { error: "Missing signature" })
  }

  let rawBody: Buffer
  try {
    rawBody = await request.readBody()
  } catch (error) {
    if (error instanceof WebhookIngressBodyTooLargeError) {
      return jsonResponse(413, "payload_too_large", { error: "Payload too large" })
    }
    return jsonResponse(400, "body_read_failed", { error: "Invalid request body" })
  }

  if (!verifyMetaWebhookSignature(config.appSecrets, request.signature, rawBody)) {
    return jsonResponse(401, "signature_invalid", { error: "Invalid signature" })
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(400, "body_not_an_object", { error: "Invalid JSON" })
    }
    body = parsed as Record<string, unknown>
  } catch {
    return jsonResponse(400, "body_not_json", { error: "Invalid JSON" })
  }

  try {
    const result = await enqueueMetaWebhookDelivery(store, body, rawBody)
    return jsonResponse(200, "delivery_stored", { received: true, ...result })
  } catch {
    // Never surface the database error to the caller; Meta re-delivers on 5xx.
    return jsonResponse(503, "inbox_write_failed", { error: "Inbox unavailable" })
  }
}

export async function handleWebhookIngressRequest(
  config: WebhookIngressConfig,
  store: WebhookInboxStore,
  request: WebhookIngressRequest,
): Promise<WebhookIngressResponse> {
  const method = request.method.toUpperCase()

  if (request.path === config.healthPath) {
    return method === "GET" || method === "HEAD"
      ? jsonResponse(200, "health_ok", { status: "ok" })
      : textResponse(405, "health_method_not_allowed", "Method Not Allowed")
  }

  if (request.path !== config.deliveryPath) {
    return textResponse(404, "unknown_path", "Not Found")
  }

  if (method === "GET") {
    return handleWebhookVerification(config, request.query)
  }

  if (method === "POST") {
    return handleWebhookDelivery(config, store, request)
  }

  return textResponse(405, "method_not_allowed", "Method Not Allowed")
}

export interface BoundedBodySource {
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Buffer | Uint8Array>
}

/**
 * Buffers a request body with a hard byte cap enforced while streaming, so an
 * unauthenticated caller cannot exhaust memory before signature verification.
 */
export async function readBoundedRequestBody(
  source: BoundedBodySource,
  maxBytes: number,
): Promise<Buffer> {
  const declaredLength = Number(source.headers["content-length"] || 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new WebhookIngressBodyTooLargeError()
  }

  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBytes) {
      throw new WebhookIngressBodyTooLargeError()
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks, totalBytes)
}

export async function assertWebhookIngressDatabaseReady(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(DATABASE_READINESS_SQL)
  if (!result.rows[0]?.inbox_table) {
    throw new Error(
      "Webhook inbox schema is not ready; apply the durable inbox migration before starting the ingress",
    )
  }
}

export async function assertWebhookIngressDatabaseAccess(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(DATABASE_ACCESS_SQL)
  const row = result.rows[0] || {}
  const missing = REQUIRED_DATABASE_ACCESS.filter((name) => row[name] !== true)
  const forbidden = FORBIDDEN_DATABASE_ACCESS.filter((name) => row[name] === true)

  if (missing.length > 0 || forbidden.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      forbidden.length > 0 ? `forbidden ${forbidden.join(", ")}` : "",
    ].filter(Boolean).join("; ")
    throw new Error(
      `Webhook ingress database role is not append-only: ${details}`,
    )
  }
}
