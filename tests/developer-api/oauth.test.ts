import { describe, expect, it } from "vitest"
import {
  buildDeveloperOAuthAuthorizationServerMetadata,
  buildDeveloperOAuthProtectedResourceMetadata,
  buildDeveloperMcpAuthChallenge,
  createDeveloperOAuthCode,
  createDeveloperOAuthAccessToken,
  createDeveloperOAuthRefreshToken,
  verifyDeveloperOAuthAccessToken,
  verifyDeveloperOAuthCode,
  verifyDeveloperOAuthRefreshToken,
  verifyPkceChallenge,
} from "@/lib/developer-api/oauth"

describe("developer API OAuth connector helpers", () => {
  const origin = "https://social.swiftdigital-s.com"
  const pepper = "test-pepper"

  it("builds MCP OAuth metadata for ChatGPT discovery", () => {
    expect(buildDeveloperOAuthProtectedResourceMetadata(origin)).toMatchObject({
      resource: `${origin}/api/developer/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    })
    expect(buildDeveloperOAuthAuthorizationServerMetadata(origin)).toMatchObject({
      issuer: origin,
      authorization_endpoint: `${origin}/api/developer/oauth/authorize`,
      token_endpoint: `${origin}/api/developer/oauth/token`,
      registration_endpoint: `${origin}/api/developer/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    })
    expect(buildDeveloperMcpAuthChallenge(origin)).toContain(`${origin}/.well-known/oauth-protected-resource`)
  })

  it("verifies S256 PKCE challenges", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

    expect(verifyPkceChallenge(verifier, challenge)).toBe(true)
    expect(verifyPkceChallenge(`${verifier}x`, challenge)).toBe(false)
  })

  it("exchanges encrypted authorization codes for short-lived access tokens", () => {
    const code = createDeveloperOAuthCode({
      apiKey: "sf_live_test_key",
      clientId: "chatgpt-test-client",
      redirectUri: "https://chat.openai.com/aip/oauth/callback",
      codeChallenge: "pkce-challenge",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
      pepper,
    })

    expect(code).not.toContain("sf_live_test_key")
    expect(verifyDeveloperOAuthCode(code, pepper)).toMatchObject({
      apiKey: "sf_live_test_key",
      clientId: "chatgpt-test-client",
      redirectUri: "https://chat.openai.com/aip/oauth/callback",
    })

    const accessToken = createDeveloperOAuthAccessToken({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
      pepper,
    })
    expect(accessToken).not.toContain("sf_live_test_key")
    expect(verifyDeveloperOAuthAccessToken(accessToken, pepper)).toMatchObject({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
    })
  })

  it("creates refresh tokens that can preserve the connector grant beyond access token expiry", () => {
    const refreshToken = createDeveloperOAuthRefreshToken({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
      clientId: "chatgpt-test-client",
      pepper,
    })

    expect(refreshToken).toMatch(/^sf_oauth_refresh\./)
    expect(refreshToken).not.toContain("sf_live_test_key")
    expect(verifyDeveloperOAuthRefreshToken(refreshToken, pepper)).toMatchObject({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
      clientId: "chatgpt-test-client",
    })
  })
})
