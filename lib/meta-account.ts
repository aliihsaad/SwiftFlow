import { decryptSecretIfNeeded, encryptSecretIfNeeded } from "@/lib/secret-crypto"

export type MetaPlatform = "facebook" | "instagram"

export interface MetaGrantedGranularScope {
  scope: string
  target_ids?: string[]
}

export interface MetaCapabilityMap {
  facebook_page_selection: boolean
  facebook_page_metadata_manage: boolean
  facebook_publish: boolean
  facebook_user_content_read: boolean
  business_management: boolean
  instagram_basic: boolean
  instagram_publish: boolean
  analytics_read: boolean
  facebook_comments_read: boolean
  facebook_comments_manage: boolean
  comments_manage: boolean
  messages_manage: boolean
  pages_messaging: boolean
}

export interface MetaAccountMetadata extends Record<string, unknown> {
  granted_scopes?: string[]
  granted_granular_scopes?: MetaGrantedGranularScope[]
  capabilities?: MetaCapabilityMap
  last_scope_sync_at?: string
  scopes_checked_at?: string
  token_status?: "available" | "missing"
  user_access_token?: string | null
  instagram_business_account_id?: string | null
  connected_page_id?: string | null
  ig_username?: string | null
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

function getEffectiveGrantedScopes(
  scopes: unknown,
  granularScopes: unknown,
): string[] {
  return Array.from(new Set([
    ...sanitizeScopes(scopes),
    ...sanitizeGranularScopes(granularScopes).map((scope) => scope.scope),
  ]))
}

export function deriveMetaCapabilities(scopes: readonly string[]): MetaCapabilityMap {
  const granted = new Set(scopes)

  return {
    facebook_page_selection: granted.has("pages_show_list"),
    facebook_page_metadata_manage: granted.has("pages_manage_metadata"),
    facebook_publish: granted.has("pages_manage_posts"),
    facebook_user_content_read: granted.has("pages_read_user_content"),
    business_management: granted.has("business_management"),
    instagram_basic: granted.has("instagram_basic"),
    instagram_publish: granted.has("instagram_content_publish"),
    analytics_read: granted.has("pages_read_engagement") || granted.has("instagram_manage_insights"),
    facebook_comments_read: granted.has("pages_read_user_content") || granted.has("pages_read_engagement") || granted.has("pages_manage_engagement"),
    facebook_comments_manage: granted.has("pages_manage_engagement"),
    comments_manage: granted.has("instagram_manage_comments"),
    messages_manage: granted.has("instagram_manage_messages"),
    pages_messaging: granted.has("pages_messaging"),
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
  userAccessToken?: string | null
  instagramBusinessAccountId?: string | null
  connectedPageId?: string | null
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
  const decryptedUserAccessToken = typeof metadata.user_access_token === "string"
    ? decryptMetaToken(metadata.user_access_token)
    : null

  return {
    ...row,
    access_token: decryptMetaToken(row.access_token ?? null),
    metadata: {
      ...metadata,
      user_access_token: decryptedUserAccessToken,
    },
  }
}

export function sanitizeMetaAccountMetadataForClient(
  metadata: MetaAccountMetadata | null | undefined,
): MetaAccountMetadata {
  if (!metadata || typeof metadata !== "object") return {}

  const sanitized: MetaAccountMetadata = {
    instagram_business_account_id: metadata.instagram_business_account_id ?? null,
    connected_page_id: metadata.connected_page_id ?? null,
    ig_username: metadata.ig_username ?? null,
    granted_scopes: getEffectiveGrantedScopes(metadata.granted_scopes, metadata.granted_granular_scopes),
    granted_granular_scopes: sanitizeGranularScopes(metadata.granted_granular_scopes),
    capabilities: metadata.capabilities,
    last_scope_sync_at: metadata.last_scope_sync_at,
    scopes_checked_at: metadata.scopes_checked_at,
    token_status: metadata.token_status,
  }

  return Object.fromEntries(
    Object.entries(sanitized).filter(([, value]) => value !== undefined),
  ) as MetaAccountMetadata
}

export function canPublishWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_publish
    : capabilities.instagram_publish
}

export function canReadAnalyticsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false
  return capabilities.analytics_read
}

export function canManageCommentsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_comments_manage
    : capabilities.comments_manage
}

export function canReadCommentsWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.facebook_comments_read || capabilities.facebook_comments_manage
    : capabilities.comments_manage
}

export function canManageMessagesWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.pages_messaging
    : capabilities.messages_manage
}

export function canReadConnectedMediaWithMetaAccount(
  metadata: MetaAccountMetadata | null | undefined,
  platform: MetaPlatform,
): boolean {
  const capabilities = getMetaCapabilities(metadata)
  if (!capabilities) return false

  return platform === "facebook"
    ? capabilities.analytics_read
    : capabilities.instagram_basic || capabilities.instagram_publish
}
