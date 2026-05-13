import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { POST as tokenPost } from "@/app/api/developer/oauth/token/route"
import { POST as registerPost } from "@/app/api/developer/oauth/register/route"
import { createDeveloperOAuthCode } from "@/lib/developer-api/oauth"

const origin = "https://social.swiftdigital-s.com"
const pepper = "test-pepper"

function setPepper() {
  process.env.DEVELOPER_API_KEY_PEPPER = pepper
}

function createCode() {
  return createDeveloperOAuthCode({
    apiKey: "sf_live_test_key",
    clientId: "chatgpt-test-client",
    redirectUri: "https://chatgpt.com/connector/oauth/callback-test",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    scope: "swiftflow.developer_api",
    resource: `${origin}/api/developer/mcp/`,
    pepper,
  })
}

describe("developer API OAuth routes", () => {
  it("echoes dynamic client registration metadata for ChatGPT", async () => {
    const response = await registerPost(new NextRequest(`${origin}/api/developer/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "SwiftFlow Test",
        redirect_uris: ["https://chatgpt.com/connector/oauth/callback-test"],
        token_endpoint_auth_method: "none",
      }),
    }))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      client_id: expect.stringMatching(/^chatgpt-swiftflow-/),
      client_name: "SwiftFlow Test",
      redirect_uris: ["https://chatgpt.com/connector/oauth/callback-test"],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      grant_types: ["authorization_code"],
    })
  })

  it("accepts a ChatGPT token request without redirect_uri and with resource", async () => {
    setPepper()
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: createCode(),
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      client_id: "chatgpt-test-client",
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
        client_id: "chatgpt-test-client",
        redirect_uri: "https://chatgpt.com/connector/oauth/callback-test",
      }),
    }))

    expect(response.status).toBe(200)
  })
})
