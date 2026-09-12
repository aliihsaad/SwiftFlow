import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as authorizePost } from "@/app/api/developer/oauth/authorize/route"
import { POST as tokenPost } from "@/app/api/developer/oauth/token/route"
import { POST as registerPost } from "@/app/api/developer/oauth/register/route"
import { createDeveloperOAuthCode, createDeveloperOAuthRefreshToken } from "@/lib/developer-api/oauth"

const origin = "https://social.swiftdigital-s.com"
const pepper = "test-pepper"
const testClientId = "chatgpt-test-client"
const testRedirectUri = "https://chatgpt.com/connector/oauth/callback-test"

// In-memory stand-ins for the two service_role tables backing the connector.
// The pure helpers (isAcceptableRedirectUri, isRegisteredRedirectUri) stay real
// so the exact-match rule itself is what these tests exercise.
const registeredClients = new Map<string, {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  scope: string | null
}>()
const redeemedCodes = new Set<string>()

vi.mock("@/lib/developer-api/oauth-clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developer-api/oauth-clients")>()
  return {
    ...actual,
    registerDeveloperOAuthClient: vi.fn(async (input: {
      clientId: string
      clientName: string | null
      redirectUris: string[]
      scope: string | null
    }) => {
      registeredClients.set(input.clientId, input)
    }),
    getDeveloperOAuthClient: vi.fn(async (clientId: string) => registeredClients.get(clientId) ?? null),
    claimDeveloperOAuthCode: vi.fn(async ({ jti }: { jti: string }) => {
      if (redeemedCodes.has(jti)) return false
      redeemedCodes.add(jti)
      return true
    }),
  }
})

function setPepper() {
  process.env.DEVELOPER_API_KEY_PEPPER = pepper
}

function createCode() {
  return createDeveloperOAuthCode({
    apiKey: "sf_live_test_key",
    clientId: testClientId,
    redirectUri: testRedirectUri,
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    scope: "swiftflow.developer_api",
    resource: `${origin}/api/developer/mcp/`,
    pepper,
  })
}

function createRefreshToken() {
  return createDeveloperOAuthRefreshToken({
    apiKey: "sf_live_test_key",
    clientId: testClientId,
    scope: "swiftflow.developer_api",
    resource: `${origin}/api/developer/mcp/`,
    pepper,
  })
}

function authorizeForm(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: testClientId,
    redirect_uri: testRedirectUri,
    response_type: "code",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "oauth_s_test",
    api_key: "sf_live_test_key",
    ...overrides,
  })
}

function postAuthorize(body: URLSearchParams) {
  return authorizePost(new NextRequest(`${origin}/api/developer/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }))
}

describe("developer API OAuth routes", () => {
  beforeEach(() => {
    registeredClients.clear()
    redeemedCodes.clear()
    // The happy-path tests act as an already-registered connector.
    registeredClients.set(testClientId, {
      clientId: testClientId,
      clientName: "SwiftFlow Test",
      redirectUris: [testRedirectUri],
      scope: "swiftflow.developer_api",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns a GET-following redirect from the API key consent form", async () => {
    setPepper()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    const response = await postAuthorize(authorizeForm())

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toContain(`${testRedirectUri}?code=sf_oauth_code.`)
    expect(response.headers.get("location")).toContain("state=oauth_s_test")
  })

  it("persists dynamic client registration metadata", async () => {
    const response = await registerPost(new NextRequest(`${origin}/api/developer/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "SwiftFlow Test",
        redirect_uris: [testRedirectUri],
        token_endpoint_auth_method: "none",
      }),
    }))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      client_id: expect.stringMatching(/^swiftflow-mcp-/),
      client_name: "SwiftFlow Test",
      redirect_uris: [testRedirectUri],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
    })
    // The returned client_id must actually be stored, or /authorize has
    // nothing to match redirect_uri against.
    expect(registeredClients.get(body.client_id)?.redirectUris).toEqual([testRedirectUri])
  })

  it("rejects registration without a usable HTTPS redirect_uri", async () => {
    const response = await registerPost(new NextRequest(`${origin}/api/developer/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "No Redirects", redirect_uris: ["http://evil.example/cb"] }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_redirect_uri" })
  })

  it("refuses an unregistered redirect_uri instead of redirecting to it", async () => {
    setPepper()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    const response = await postAuthorize(authorizeForm({
      redirect_uri: "https://evil.example/callback",
    }))

    // Must render an error page, never a 303 carrying the code.
    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    await expect(response.text()).resolves.toContain("does not match a registered redirect URI")
  })

  it("refuses an unknown client_id", async () => {
    setPepper()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    const response = await postAuthorize(authorizeForm({ client_id: "never-registered" }))

    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    await expect(response.text()).resolves.toContain("Unknown client_id")
  })

  it("accepts a ChatGPT token request without redirect_uri and with resource", async () => {
    setPepper()
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: createCode(),
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      client_id: testClientId,
      resource: `${origin}/api/developer/mcp`,
    })

    const response = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      access_token: expect.stringMatching(/^sf_oauth_access\./),
      refresh_token: expect.stringMatching(/^sf_oauth_refresh\./),
      token_type: "Bearer",
      expires_in: 3600,
      scope: "swiftflow.developer_api",
    })
  })

  it("accepts JSON token requests from OAuth clients", async () => {
    setPepper()
    const response = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: createCode(),
        code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        client_id: testClientId,
        redirect_uri: testRedirectUri,
      }),
    }))

    expect(response.status).toBe(200)
  })

  it("rejects a second exchange of the same authorization code", async () => {
    setPepper()
    const code = createCode()
    const exchange = () => tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        client_id: testClientId,
      }),
    }))

    await expect(exchange()).resolves.toMatchObject({ status: 200 })

    const replay = await exchange()
    expect(replay.status).toBe(400)
    await expect(replay.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Authorization code has already been redeemed",
    })
  })

  it("does not consume the code when PKCE verification fails", async () => {
    setPepper()
    const code = createCode()

    const failed = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        code_verifier: "wrong-verifier",
        client_id: testClientId,
      }),
    }))
    expect(failed.status).toBe(400)

    // The legitimate client must still be able to redeem it.
    const succeeded = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        client_id: testClientId,
      }),
    }))
    expect(succeeded.status).toBe(200)
  })

  it("refreshes connector access tokens without requiring a new API key", async () => {
    setPepper()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: createRefreshToken(),
      client_id: testClientId,
      resource: `${origin}/api/developer/mcp`,
    })

    const response = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      access_token: expect.stringMatching(/^sf_oauth_access\./),
      refresh_token: expect.stringMatching(/^sf_oauth_refresh\./),
      token_type: "Bearer",
      expires_in: 3600,
      scope: "swiftflow.developer_api",
    })
  })

  it("rejects refresh when the backing Developer API key is no longer valid", async () => {
    setPepper()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }))

    const response = await tokenPost(new NextRequest(`${origin}/api/developer/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: createRefreshToken(),
        client_id: testClientId,
      }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Backing Developer API key is invalid, expired, or revoked",
    })
  })
})
