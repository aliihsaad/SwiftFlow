import { META_GRAPH_API_VERSION } from "@/lib/meta-graph-version"

export const INSTAGRAM_AUTOMATION_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
] as const

const INSTAGRAM_OPTIONAL_SCOPES = new Set([
  "instagram_business_content_publish",
  "instagram_business_manage_messages",
])

const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
const INSTAGRAM_GRAPH_URL = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`

export type InstagramTokenHealth = "valid" | "expiring_soon" | "invalid"
export type InstagramWebhookStatus = "active" | "missing" | "error" | "unknown"

export type InstagramProfile = {
  id: string
  user_id?: string
  username: string
  account_type: string | null
}

export type InstagramOAuthToken = {
  access_token: string
  user_id?: string
  token_type?: string
  expires_in?: number
  permissions: string[]
  permissionsSource: "oauth_response" | "oauth_request"
}

export type InstagramSubscription = {
  active: boolean
  subscribedFields: string[]
}

export type InstagramAutomationHealth = {
  status: "not_connected" | "action_required" | "ready"
  ready: boolean
  checks: {
    connected: boolean
    professionalAccount: boolean
    requiredPermissions: boolean
    tokenValid: boolean
    commentsWebhook: boolean
  }
  missingScopes: string[]
  actions: string[]
}

export class InstagramApiError extends Error {
  status: number
  code: string

  constructor(operation: string, status: number, code = "instagram_api_error") {
    super(`${operation} failed (${status})`)
    this.name = "InstagramApiError"
    this.status = status
    this.code = code
  }
}

export function resolveInstagramProfessionalAccountId(input: {
  tokenUserId?: string
  profile: InstagramProfile
}): string | null {
  const tokenUserId = String(input.tokenUserId || "").trim()
  const profileUserId = String(input.profile.user_id || "").trim()

  // Instagram Login can return two valid identifiers for the same account:
  // profile.id is app-scoped, while user_id is the professional account ID
  // used by webhooks and account-level Graph API endpoints.
  if (tokenUserId && profileUserId && tokenUserId !== profileUserId) return null
  return profileUserId || tokenUserId || input.profile.id
}

function normalizeAppUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

function parseOptionalScopes(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => INSTAGRAM_OPTIONAL_SCOPES.has(scope))
}

export function getInstagramOAuthScopes(): string[] {
  return Array.from(new Set([
    ...INSTAGRAM_AUTOMATION_REQUIRED_SCOPES,
    ...parseOptionalScopes(process.env.INSTAGRAM_OAUTH_EXTRA_SCOPES),
  ]))
}

export function getInstagramRedirectUri(): string {
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (!appUrl) {
    throw new Error("Instagram Login is not configured")
  }
  return `${normalizeAppUrl(appUrl)}/api/auth/instagram/callback`
}

export function getInstagramAppCredentials(): {
  appId: string
  appSecret: string
} {
  const appId = String(process.env.INSTAGRAM_APP_ID || "").trim()
  const appSecret = String(process.env.INSTAGRAM_APP_SECRET || "").trim()
  if (!appId || !appSecret) {
    throw new Error("Instagram Login is not configured")
  }
  return { appId, appSecret }
}

export function buildInstagramAuthorizationUrl(input: {
  appId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: (input.scopes || INSTAGRAM_AUTOMATION_REQUIRED_SCOPES).join(","),
    state: input.state,
  })
  return `${INSTAGRAM_AUTHORIZE_URL}?${params.toString()}`
}

function parseMetaErrorCode(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error_type?: unknown
      error?: { code?: unknown; type?: unknown }
    }
    const code = parsed?.error?.code
    if (typeof code === "number" || typeof code === "string") return String(code)
    const type = parsed?.error?.type ?? parsed?.error_type
    if (typeof type === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(type)) return type
  } catch {
    // Deliberately ignore raw provider text so credentials never reach logs or UI.
  }
  return "instagram_api_error"
}

async function requireOk(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response
  const raw = await response.text().catch(() => "")
  throw new InstagramApiError(operation, response.status, parseMetaErrorCode(raw))
}

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string")
  }
  if (typeof value === "string") {
    return value.split(",").map((scope) => scope.trim()).filter(Boolean)
  }
  return []
}

export async function exchangeInstagramCode(input: {
  code: string
  appId: string
  appSecret: string
  redirectUri: string
  requestedScopes?: readonly string[]
}, fetchImpl: typeof fetch = fetch): Promise<InstagramOAuthToken> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  })
  const response = await fetchImpl(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  await requireOk(response, "Instagram authorization")
  const parsed = await response.json() as Record<string, unknown>
  if (typeof parsed.access_token !== "string" || !parsed.access_token) {
    throw new InstagramApiError("Instagram authorization", 502, "missing_access_token")
  }
  const responsePermissions = parsePermissions(parsed.permissions ?? parsed.scope)
  const permissions = responsePermissions.length > 0
    ? responsePermissions
    : [...(input.requestedScopes || INSTAGRAM_AUTOMATION_REQUIRED_SCOPES)]

  return {
    access_token: parsed.access_token,
    user_id: typeof parsed.user_id === "number" || typeof parsed.user_id === "string"
      ? String(parsed.user_id)
      : undefined,
    token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
    permissions,
    permissionsSource: responsePermissions.length > 0 ? "oauth_response" : "oauth_request",
  }
}

export async function exchangeForLongLivedInstagramToken(input: {
  accessToken: string
  appSecret: string
}, fetchImpl: typeof fetch = fetch): Promise<{
  access_token: string
  token_type?: string
  expires_in?: number
}> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: input.appSecret,
    access_token: input.accessToken,
  })
  const response = await fetchImpl(`${INSTAGRAM_GRAPH_URL}/access_token?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  await requireOk(response, "Instagram long-lived token exchange")
  const parsed = await response.json() as Record<string, unknown>
  if (typeof parsed.access_token !== "string" || !parsed.access_token) {
    throw new InstagramApiError("Instagram long-lived token exchange", 502, "missing_access_token")
  }
  return {
    access_token: parsed.access_token,
    token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
  }
}

export async function refreshLongLivedInstagramToken(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ access_token: string; token_type?: string; expires_in?: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  })
  const response = await fetchImpl(`${INSTAGRAM_GRAPH_URL}/refresh_access_token?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  await requireOk(response, "Instagram token refresh")
  const parsed = await response.json() as Record<string, unknown>
  if (typeof parsed.access_token !== "string" || !parsed.access_token) {
    throw new InstagramApiError("Instagram token refresh", 502, "missing_access_token")
  }
  return {
    access_token: parsed.access_token,
    token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
  }
}

export async function fetchInstagramProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramProfile> {
  const response = await fetchImpl(
    `${INSTAGRAM_GRAPH_URL}/me?fields=id,user_id,username,account_type`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  )
  await requireOk(response, "Instagram profile verification")
  const parsed = await response.json() as Record<string, unknown>
  if (typeof parsed.id !== "string" || typeof parsed.username !== "string") {
    throw new InstagramApiError("Instagram profile verification", 502, "invalid_profile_response")
  }
  return {
    id: parsed.id,
    user_id: typeof parsed.user_id === "number" || typeof parsed.user_id === "string"
      ? String(parsed.user_id)
      : undefined,
    username: parsed.username,
    account_type: typeof parsed.account_type === "string" ? parsed.account_type : null,
  }
}

function parseSubscription(payload: unknown): InstagramSubscription {
  const data = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data
    : []
  const subscribedFields = Array.from(new Set(data.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const fields = (item as { subscribed_fields?: unknown }).subscribed_fields
    return Array.isArray(fields)
      ? fields.filter((field): field is string => typeof field === "string")
      : []
  })))
  return { active: subscribedFields.includes("comments"), subscribedFields }
}

export async function getInstagramWebhookSubscription(input: {
  accountId: string
  accessToken: string
}, fetchImpl: typeof fetch = fetch): Promise<InstagramSubscription> {
  const response = await fetchImpl(`${INSTAGRAM_GRAPH_URL}/${encodeURIComponent(input.accountId)}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store",
  })
  await requireOk(response, "Instagram webhook verification")
  return parseSubscription(await response.json())
}

export async function subscribeInstagramComments(input: {
  accountId: string
  accessToken: string
}, fetchImpl: typeof fetch = fetch): Promise<InstagramSubscription> {
  const response = await fetchImpl(`${INSTAGRAM_GRAPH_URL}/${encodeURIComponent(input.accountId)}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ subscribed_fields: "comments" }),
    cache: "no-store",
  })
  await requireOk(response, "Instagram webhook subscription")
  return getInstagramWebhookSubscription(input, fetchImpl)
}

export function deriveInstagramAutomationHealth(input: {
  connected: boolean
  accountType?: string | null
  grantedScopes?: readonly string[]
  tokenHealth?: InstagramTokenHealth | null
  webhookStatus?: InstagramWebhookStatus | null
  subscribedFields?: readonly string[]
}): InstagramAutomationHealth {
  const granted = new Set(input.grantedScopes || [])
  const missingScopes = INSTAGRAM_AUTOMATION_REQUIRED_SCOPES.filter((scope) => !granted.has(scope))
  const accountType = String(input.accountType || "").toUpperCase()
  const professionalAccount = accountType === "BUSINESS" || accountType === "CREATOR" || accountType === "MEDIA_CREATOR"
  const commentsWebhook = input.webhookStatus === "active"
    && (input.subscribedFields || []).includes("comments")
  const checks = {
    connected: input.connected,
    professionalAccount,
    requiredPermissions: missingScopes.length === 0,
    tokenValid: input.connected && input.tokenHealth !== "invalid",
    commentsWebhook,
  }
  const actions: string[] = []
  if (!checks.connected) actions.push("Connect an Instagram professional account")
  if (checks.connected && !checks.professionalAccount) actions.push("Use an Instagram Business or Creator account")
  if (checks.connected && !checks.requiredPermissions) actions.push("Reconnect and approve comment automation permissions")
  if (checks.connected && !checks.tokenValid) actions.push("Reconnect the expired Instagram account")
  if (checks.connected && !checks.commentsWebhook) actions.push("Subscribe the account to comment webhooks")
  const ready = Object.values(checks).every(Boolean)
  return {
    status: !input.connected ? "not_connected" : ready ? "ready" : "action_required",
    ready,
    checks,
    missingScopes,
    actions,
  }
}
