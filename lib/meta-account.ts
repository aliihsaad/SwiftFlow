import { decryptSecretIfNeeded, encryptSecretIfNeeded } from "@/lib/secret-crypto"

export type MetaPlatform = "instagram"

export interface MetaGrantedGranularScope {
  scope: string
  target_ids?: string[]
}

export interface MetaCapabilityMap {
  instagram_basic: boolean
  instagram_publish: boolean
  analytics_read: boolean
  comments_manage: boolean
  messages_manage: boolean
}

export interface MetaAccountMetadata extends Record<string, unknown> {
  granted_scopes?: string[]
  granted_granular_scopes?: MetaGrantedGranularScope[]
  capabilities?: MetaCapabilityMap
  last_scope_sync_at?: string
  scopes_checked_at?: string
  token_status?: "available" | "missing"
  token_health?: "valid" | "expiring_soon" | "invalid"
  token_checked_at?: string
  instagram_business_account_id?: string | null
  ig_username?: string | null
  connection_method?: "instagram_login"
  account_type?: string | null
  scope_source?: "oauth_response" | "oauth_request"
  webhook_subscription_status?: "active" | "missing" | "error" | "unknown"
  webhook_subscribed_fields?: string[]
  webhook_checked_at?: string
  webhook_error_code?: string | null
}

export interface MetaAccountRow {
  access_token?: string | null
  metadata?: MetaAccountMetadata | null
}

function sanitizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return []
  return scopes.filter((scope): scope is string => typeof scope === "string")
}

function sanitizeGranularScopes(scopes: unknown): MetaGrantedGranularScope[] {
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

export function deriveMetaCapabilities(scopes: readonly string[]): MetaCapabilityMap {
  const granted = new Set(scopes)

  return {
    instagram_basic: granted.has("instagram_basic") || granted.has("instagram_business_basic"),
    instagram_publish: granted.has("instagram_content_publish") || granted.has("instagram_business_content_publish"),
    analytics_read: granted.has("instagram_manage_insights") || granted.has("instagram_business_manage_insights"),
    comments_manage: granted.has("instagram_manage_comments") || granted.has("instagram_business_manage_comments"),
    messages_manage: granted.has("instagram_manage_messages") || granted.has("instagram_business_manage_messages"),
  }
}

function getMetaCapabilities(
  metadata: MetaAccountMetadata | null | undefined,
): MetaCapabilityMap | null {
  if (!metadata || typeof metadata !== "object") return null

  const grantedScopes = getEffectiveGrantedScopes(metadata.granted_scopes, metadata.granted_granular_scopes)
  return grantedScopes.length > 0
    ? deriveMetaCapabilities(grantedScopes)
    : metadata.capabilities || null
}

export function buildMetaAccountMetadata(input: {
  existingMetadata?: MetaAccountMetadata | null
  grantedScopes?: unknown
  grantedGranularScopes?: unknown
  instagramBusinessAccountId?: string | null
  igUsername?: string | null
  tokenStatus: "available" | "missing"
  syncedAt?: string
}): MetaAccountMetadata {
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
    ig_username: input.igUsername ?? existingMetadata.ig_username ?? null,
    granted_scopes: grantedScopes,
    granted_granular_scopes: grantedGranularScopes,
    capabilities: deriveMetaCapabilities(effectiveGrantedScopes),
    last_scope_sync_at: syncedAt,
    scopes_checked_at: syncedAt,
    token_status: input.tokenStatus,
  }
}

export function encryptMetaToken(value: string | null | undefined): string | null {
  return encryptSecretIfNeeded(value)
}

export function decryptMetaToken(value: string | null | undefined): string | null {
  return decryptSecretIfNeeded(value)
}

export function decryptMetaAccountRow<T extends MetaAccountRow>(row: T): T & {
  access_token: string | null
  metadata: MetaAccountMetadata
} {
  const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {}

  return {
    ...row,
    access_token: decryptMetaToken(row.access_token ?? null),
    metadata,
  }
}

export function sanitizeMetaAccountMetadataForClient(
  metadata: MetaAccountMetadata | null | undefined,
): MetaAccountMetadata {
  if (!metadata || typeof metadata !== "object") return {}

  const sanitized: MetaAccountMetadata = {
    instagram_business_account_id: metadata.instagram_business_account_id ?? null,
    ig_username: metadata.ig_username ?? null,
    granted_scopes: getEffectiveGrantedScopes(metadata.granted_scopes, metadata.granted_granular_scopes),
    granted_granular_scopes: sanitizeGranularScopes(metadata.granted_granular_scopes),
    capabilities: metadata.capabilities,
    last_scope_sync_at: metadata.last_scope_sync_at,
    scopes_checked_at: metadata.scopes_checked_at,
    token_status: metadata.token_status,
    token_health: metadata.token_health,
    token_checked_at: metadata.token_checked_at,
    connection_method: metadata.connection_method,
    account_type: metadata.account_type ?? null,
    scope_source: metadata.scope_source,
    webhook_subscription_status: metadata.webhook_subscription_status,
    webhook_subscribed_fields: sanitizeScopes(metadata.webhook_subscribed_fields),
    webhook_checked_at: metadata.webhook_checked_at,
    webhook_error_code: metadata.webhook_error_code ?? null,
  }

  return Object.fromEntries(
    Object.entries(sanitized).filter(([, value]) => value !== undefined),
  ) as MetaAccountMetadata
}

export function canReadAnalyticsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
): boolean {
  return getMetaCapabilities(metadata)?.analytics_read === true
}

export function canManageCommentsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  _platform: MetaPlatform,
): boolean {
  return getMetaCapabilities(metadata)?.comments_manage === true
}

export function canReadCommentsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  _platform: MetaPlatform,
): boolean {
  return getMetaCapabilities(metadata)?.comments_manage === true
}

export function canManageMessagesWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  _platform: MetaPlatform,
): boolean {
  return getMetaCapabilities(metadata)?.messages_manage === true
}

export function canReadConnectedMediaWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  _platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  return capabilities?.instagram_basic === true || capabilities?.instagram_publish === true
}
