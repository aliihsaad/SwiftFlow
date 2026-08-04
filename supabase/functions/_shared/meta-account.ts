// @ts-nocheck - Deno runtime helper

import { decryptSecretIfNeeded, encryptSecretIfNeeded } from "./secret-crypto.ts"

function sanitizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return []
  return scopes.filter((scope): scope is string => typeof scope === "string")
}

function sanitizeGranularScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) return []

  return scopes
    .filter((scope): scope is { scope: string; target_ids?: unknown } => typeof scope?.scope === "string")
    .map((scope) => ({
      scope: scope.scope,
      target_ids: Array.isArray(scope.target_ids)
        ? scope.target_ids.filter((targetId): targetId is string => typeof targetId === "string")
        : undefined,
    }))
}

function getEffectiveGrantedScopes(scopes: unknown, granularScopes: unknown): string[] {
  return Array.from(new Set([
    ...sanitizeScopes(scopes),
    ...sanitizeGranularScopes(granularScopes).map((scope) => scope.scope),
  ]))
}

export function deriveMetaCapabilities(scopes: readonly string[]) {
  const granted = new Set(scopes)

  return {
    instagram_basic: granted.has("instagram_basic") || granted.has("instagram_business_basic"),
    instagram_publish: granted.has("instagram_content_publish") || granted.has("instagram_business_content_publish"),
    analytics_read: granted.has("instagram_manage_insights") || granted.has("instagram_business_manage_insights"),
    comments_manage: granted.has("instagram_manage_comments") || granted.has("instagram_business_manage_comments"),
    messages_manage: granted.has("instagram_manage_messages") || granted.has("instagram_business_manage_messages"),
  }
}

function getMetaCapabilities(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return null

  const grantedScopes = getEffectiveGrantedScopes(metadata.granted_scopes, metadata.granted_granular_scopes)
  return grantedScopes.length > 0
    ? deriveMetaCapabilities(grantedScopes)
    : (metadata.capabilities as Record<string, unknown> | undefined) || null
}

export async function encryptMetaToken(value: string | null | undefined): Promise<string | null> {
  return await encryptSecretIfNeeded(value)
}

export async function decryptMetaToken(value: string | null | undefined): Promise<string | null> {
  return await decryptSecretIfNeeded(value)
}

export async function decryptMetaAccountRow(row: { access_token?: string | null; metadata?: Record<string, unknown> | null }) {
  const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {}

  return {
    ...row,
    access_token: await decryptMetaToken(row.access_token ?? null),
    metadata,
  }
}

export function canReadAnalyticsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return getMetaCapabilities(metadata)?.analytics_read === true
}

export function canManageCommentsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  _platform: "instagram",
): boolean {
  return getMetaCapabilities(metadata)?.comments_manage === true
}

export function canReadCommentsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  _platform: "instagram",
): boolean {
  return getMetaCapabilities(metadata)?.comments_manage === true
}

export function canManageMessagesWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  _platform: "instagram",
): boolean {
  return getMetaCapabilities(metadata)?.messages_manage === true
}

export function canReadConnectedMediaWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  _platform: "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  return capabilities?.instagram_basic === true || capabilities?.instagram_publish === true
}
