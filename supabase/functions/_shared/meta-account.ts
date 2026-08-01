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
    facebook_page_selection: granted.has("pages_show_list"),
    facebook_page_metadata_manage: granted.has("pages_manage_metadata"),
    facebook_publish: granted.has("pages_manage_posts"),
    facebook_user_content_read: granted.has("pages_read_user_content"),
    business_management: granted.has("business_management"),
    instagram_basic: granted.has("instagram_basic") || granted.has("instagram_business_basic"),
    instagram_publish: granted.has("instagram_content_publish") || granted.has("instagram_business_content_publish"),
    analytics_read: granted.has("pages_read_engagement")
      || granted.has("instagram_manage_insights")
      || granted.has("instagram_business_manage_insights"),
    facebook_comments_read: granted.has("pages_read_user_content") || granted.has("pages_read_engagement") || granted.has("pages_manage_engagement"),
    facebook_comments_manage: granted.has("pages_manage_engagement"),
    comments_manage: granted.has("instagram_manage_comments") || granted.has("instagram_business_manage_comments"),
    messages_manage: granted.has("instagram_manage_messages") || granted.has("instagram_business_manage_messages"),
    pages_messaging: granted.has("pages_messaging"),
  }
}

function getMetaCapabilities(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return null

  const grantedScopes = getEffectiveGrantedScopes(metadata.granted_scopes, metadata.granted_granular_scopes)
  return grantedScopes.length > 0
    ? deriveMetaCapabilities(grantedScopes)
    : (metadata.capabilities as Record<string, unknown> | undefined) || null
}

export function buildMetaAccountMetadata(input: {
  existingMetadata?: Record<string, unknown> | null
  grantedScopes?: unknown
  grantedGranularScopes?: unknown
  userAccessToken?: string | null
  instagramBusinessAccountId?: string | null
  connectedPageId?: string | null
  igUsername?: string | null
  tokenStatus: "available" | "missing"
  syncedAt?: string
}) {
  const grantedScopes = sanitizeScopes(input.grantedScopes)
  const grantedGranularScopes = sanitizeGranularScopes(input.grantedGranularScopes)
  const effectiveGrantedScopes = getEffectiveGrantedScopes(grantedScopes, grantedGranularScopes)
  const existingMetadata = input.existingMetadata && typeof input.existingMetadata === "object"
    ? input.existingMetadata
    : {}
  const syncedAt = input.syncedAt || new Date().toISOString()

  return {
    ...existingMetadata,
    instagram_business_account_id: input.instagramBusinessAccountId ?? existingMetadata.instagram_business_account_id ?? null,
    connected_page_id: input.connectedPageId ?? existingMetadata.connected_page_id ?? null,
    ig_username: input.igUsername ?? existingMetadata.ig_username ?? null,
    user_access_token: input.userAccessToken ?? (typeof existingMetadata.user_access_token === "string" ? existingMetadata.user_access_token : null),
    granted_scopes: grantedScopes,
    granted_granular_scopes: grantedGranularScopes,
    capabilities: deriveMetaCapabilities(effectiveGrantedScopes),
    last_scope_sync_at: syncedAt,
    scopes_checked_at: syncedAt,
    token_status: input.tokenStatus,
  }
}

export async function encryptMetaToken(value: string | null | undefined): Promise<string | null> {
  return await encryptSecretIfNeeded(value)
}

export async function decryptMetaToken(value: string | null | undefined): Promise<string | null> {
  return await decryptSecretIfNeeded(value)
}

export async function decryptMetaAccountRow(row: { access_token?: string | null; metadata?: Record<string, unknown> | null }) {
  const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {}
  const decryptedUserAccessToken = typeof metadata.user_access_token === "string"
    ? await decryptMetaToken(metadata.user_access_token)
    : null

  return {
    ...row,
    access_token: await decryptMetaToken(row.access_token ?? null),
    metadata: {
      ...metadata,
      user_access_token: decryptedUserAccessToken,
    },
  }
}

export function canPublishWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  platform: "facebook" | "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_publish === true
    : capabilities.instagram_publish === true
}

export function canReadAnalyticsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false
  return capabilities.analytics_read === true
}

export function canManageCommentsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  platform: "facebook" | "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_comments_manage === true
    : capabilities.comments_manage === true
}

export function canReadCommentsWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  platform: "facebook" | "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_comments_read === true || capabilities.facebook_comments_manage === true
    : capabilities.comments_manage === true
}

export function canManageMessagesWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  platform: "facebook" | "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.pages_messaging === true
    : capabilities.messages_manage === true
}

export function canReadConnectedMediaWithMetaAccount(
  metadata: Record<string, unknown> | null | undefined,
  platform: "facebook" | "instagram",
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.analytics_read === true
    : capabilities.instagram_basic === true || capabilities.instagram_publish === true
}
