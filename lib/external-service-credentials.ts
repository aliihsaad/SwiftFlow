import "server-only"

import { decryptSecretIfNeeded, encryptSecret, normalizeOptionalSecretInput } from "@/lib/secret-crypto"

export type ExternalServiceSecretField = "password" | "api_key"

export type ExternalServiceRow = {
  id: string
  workspace_id: string
  service_name: string
  website: string | null
  email: string | null
  password: string | null
  subscription_tier: string | null
  price: string | null
  api_key: string | null
  created_at: string
}

export type ExternalServiceClientRow = Omit<ExternalServiceRow, "password" | "api_key"> & {
  password: null
  api_key: null
  has_password: boolean
  has_api_key: boolean
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null
}

function normalizeRequiredServiceName(value: unknown): string {
  const serviceName = normalizeOptionalText(value, 160)
  if (!serviceName) throw new Error("Service name is required")
  return serviceName
}

function encryptBrowserSecret(value: unknown): string | null {
  const normalized = normalizeOptionalSecretInput(value)
  if (normalized === null) return null
  if (normalized.length > 8_192) throw new Error("Credential is too long")
  return encryptSecret(normalized)
}

function buildPublicFields(body: Record<string, unknown>) {
  return {
    service_name: normalizeRequiredServiceName(body.service_name),
    website: normalizeOptionalText(body.website, 2_048),
    email: normalizeOptionalText(body.email, 320),
    subscription_tier: normalizeOptionalText(body.subscription_tier, 120),
    price: normalizeOptionalText(body.price, 80),
  }
}

export function buildExternalServiceCreatePayload(body: Record<string, unknown>) {
  return {
    ...buildPublicFields(body),
    password: encryptBrowserSecret(body.password),
    api_key: encryptBrowserSecret(body.api_key),
  }
}

export function buildExternalServiceUpdatePayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = buildPublicFields(body)

  if (body.clear_password === true) {
    payload.password = null
  } else {
    const password = normalizeOptionalSecretInput(body.password)
    if (password !== null) payload.password = encryptBrowserSecret(password)
  }

  if (body.clear_api_key === true) {
    payload.api_key = null
  } else {
    const apiKey = normalizeOptionalSecretInput(body.api_key)
    if (apiKey !== null) payload.api_key = encryptBrowserSecret(apiKey)
  }

  return payload
}

export function sanitizeExternalServiceForClient(row: ExternalServiceRow): ExternalServiceClientRow {
  return {
    ...row,
    password: null,
    api_key: null,
    has_password: typeof row.password === "string" && row.password.length > 0,
    has_api_key: typeof row.api_key === "string" && row.api_key.length > 0,
  }
}

export function revealExternalServiceSecret(
  row: Pick<ExternalServiceRow, "password" | "api_key">,
  field: ExternalServiceSecretField,
): string | null {
  return decryptSecretIfNeeded(row[field])
}

export function parseExternalServiceSecretField(value: unknown): ExternalServiceSecretField {
  if (value === "password" || value === "api_key") return value
  throw new Error("Invalid credential field")
}
