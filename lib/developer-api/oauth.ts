import crypto from "node:crypto"

const OAUTH_SCOPE = "swiftflow.developer_api"
const CODE_TTL_SECONDS = 10 * 60
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

type DeveloperOAuthPayload = {
  apiKey: string
  scope: string
  resource: string
  exp: number
}

type DeveloperOAuthCodePayload = DeveloperOAuthPayload & {
  clientId: string
  redirectUri: string
  codeChallenge: string
}

type DeveloperOAuthRefreshPayload = DeveloperOAuthPayload & {
  clientId: string
}

type CreateOAuthCodeInput = Omit<DeveloperOAuthCodePayload, "exp"> & {
  pepper: string
  now?: number
}

type CreateOAuthAccessTokenInput = Omit<DeveloperOAuthPayload, "exp"> & {
  pepper: string
  now?: number
}

type CreateOAuthRefreshTokenInput = Omit<DeveloperOAuthRefreshPayload, "exp"> & {
  pepper: string
  now?: number
}

function base64Url(buffer: Buffer | string): string {
  return Buffer.from(buffer).toString("base64url")
}

function keyFromPepper(pepper: string): Buffer {
  return crypto.createHash("sha256").update(`swiftflow-oauth:${pepper}`).digest()
}

function encryptPayload(prefix: string, payload: object, pepper: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromPepper(pepper), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${prefix}.${base64Url(iv)}.${base64Url(tag)}.${base64Url(encrypted)}`
}

function decryptPayload<T>(token: string, expectedPrefix: string, pepper: string): T {
  const [prefix, ivValue, tagValue, encryptedValue] = token.split(".")
  if (prefix !== expectedPrefix || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid OAuth token format")
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromPepper(pepper), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ])
  const payload = JSON.parse(decrypted.toString("utf8")) as T & { exp?: number }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth token expired")
  }
  return payload
}

export function normalizeDeveloperOAuthResource(resource: string) {
  return resource.replace(/\/$/, "")
}

export function buildDeveloperOAuthProtectedResourceMetadata(origin: string) {
  const baseUrl = origin.replace(/\/$/, "")
  return {
    resource: normalizeDeveloperOAuthResource(`${baseUrl}/api/developer/mcp`),
    authorization_servers: [baseUrl],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "SwiftFlow Developer API",
  }
}

export function buildDeveloperOAuthAuthorizationServerMetadata(origin: string) {
  const baseUrl = origin.replace(/\/$/, "")
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/developer/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/developer/oauth/token`,
    registration_endpoint: `${baseUrl}/api/developer/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [OAUTH_SCOPE],
  }
}

export function buildDeveloperMcpAuthChallenge(origin: string, error = "invalid_token", description = "Connect SwiftFlow to continue") {
  const baseUrl = origin.replace(/\/$/, "")
  return `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", scope="${OAUTH_SCOPE}", error="${error}", error_description="${description}"`
}

export function createDeveloperOAuthCode(input: CreateOAuthCodeInput): string {
  return encryptPayload("sf_oauth_code", {
    apiKey: input.apiKey,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: normalizeDeveloperOAuthResource(input.resource),
    exp: (input.now ?? Math.floor(Date.now() / 1000)) + CODE_TTL_SECONDS,
  }, input.pepper)
}

export function verifyDeveloperOAuthCode(code: string, pepper: string): DeveloperOAuthCodePayload {
  return decryptPayload<DeveloperOAuthCodePayload>(code, "sf_oauth_code", pepper)
}

export function createDeveloperOAuthAccessToken(input: CreateOAuthAccessTokenInput): string {
  return encryptPayload("sf_oauth_access", {
    apiKey: input.apiKey,
    scope: input.scope,
    resource: normalizeDeveloperOAuthResource(input.resource),
    exp: (input.now ?? Math.floor(Date.now() / 1000)) + ACCESS_TOKEN_TTL_SECONDS,
  }, input.pepper)
}

export function verifyDeveloperOAuthAccessToken(token: string, pepper: string): DeveloperOAuthPayload {
  return decryptPayload<DeveloperOAuthPayload>(token, "sf_oauth_access", pepper)
}

export function createDeveloperOAuthRefreshToken(input: CreateOAuthRefreshTokenInput): string {
  return encryptPayload("sf_oauth_refresh", {
    apiKey: input.apiKey,
    clientId: input.clientId,
    scope: input.scope,
    resource: normalizeDeveloperOAuthResource(input.resource),
    exp: (input.now ?? Math.floor(Date.now() / 1000)) + REFRESH_TOKEN_TTL_SECONDS,
  }, input.pepper)
}

export function verifyDeveloperOAuthRefreshToken(token: string, pepper: string): DeveloperOAuthRefreshPayload {
  return decryptPayload<DeveloperOAuthRefreshPayload>(token, "sf_oauth_refresh", pepper)
}

export function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const digest = crypto.createHash("sha256").update(verifier).digest("base64url")
  if (digest.length !== challenge.length) return false
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(challenge))
}

export function getDeveloperOAuthScope() {
  return OAUTH_SCOPE
}

export function getDeveloperOAuthAccessTokenTtlSeconds() {
  return ACCESS_TOKEN_TTL_SECONDS
}

export function getDeveloperOAuthRefreshTokenTtlSeconds() {
  return REFRESH_TOKEN_TTL_SECONDS
}
