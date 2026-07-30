import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  buildInstagramAuthorizationUrl,
  deriveInstagramAutomationHealth,
  exchangeInstagramCode,
  fetchInstagramProfile,
  InstagramApiError,
  subscribeInstagramComments,
} from "@/lib/instagram-onboarding"
import {
  getInstagramConnectionNotice,
  sanitizeInstagramDiagnosticValue,
} from "@/lib/instagram-onboarding-diagnostics"
import {
  deriveMetaCapabilities,
  sanitizeMetaAccountMetadataForClient,
} from "@/lib/meta-account"

const TOKEN = "IGAA-secret-token-that-must-never-appear"
const ACCOUNT_ID = "28929941546606289"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("direct Instagram onboarding", () => {
  it("builds the direct Instagram authorization URL with the narrow automation scopes", () => {
    const url = new URL(buildInstagramAuthorizationUrl({
      appId: "instagram-app-id",
      redirectUri: "https://swiftflow.example/api/auth/instagram/callback",
      state: "nonce-123",
    }))

    expect(url.origin).toBe("https://www.instagram.com")
    expect(url.pathname).toBe("/oauth/authorize")
    expect(url.searchParams.get("client_id")).toBe("instagram-app-id")
    expect(url.searchParams.get("enable_fb_login")).toBe("0")
    expect(url.searchParams.get("state")).toBe("nonce-123")
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      "instagram_business_basic",
      "instagram_business_manage_comments",
    ])
    expect(url.toString()).not.toContain("pages_")
    expect(url.toString()).not.toContain("facebook.com")
  })

  it("exchanges the authorization code with a form POST and never puts the secret in the URL", async () => {
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.instagram.com/oauth/access_token")
      expect(init?.method).toBe("POST")
      const body = new URLSearchParams(String(init?.body))
      expect(body.get("client_secret")).toBe("instagram-secret")
      expect(body.get("code")).toBe("authorization-code")
      return jsonResponse(200, {
        access_token: TOKEN,
        user_id: ACCOUNT_ID,
        permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
      })
    }) as unknown as typeof fetch

    const result = await exchangeInstagramCode({
      code: "authorization-code",
      appId: "instagram-app-id",
      appSecret: "instagram-secret",
      redirectUri: "https://swiftflow.example/api/auth/instagram/callback",
    }, fetcher)

    expect(result.access_token).toBe(TOKEN)
    expect(result.permissionsSource).toBe("oauth_response")
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("uses Bearer authorization for profile and webhook operations", async () => {
    const requests: Array<{ url: string; authorization: string | null; method: string }> = []
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      requests.push({
        url: String(url),
        authorization: headers.get("authorization"),
        method: init?.method || "GET",
      })
      if (String(url).includes("/me?")) {
        return jsonResponse(200, {
          id: ACCOUNT_ID,
          username: "alidevlab",
          account_type: "MEDIA_CREATOR",
        })
      }
      if (init?.method === "POST") return jsonResponse(200, { success: true })
      return jsonResponse(200, {
        data: [{ id: ACCOUNT_ID, subscribed_fields: ["comments"] }],
      })
    }) as unknown as typeof fetch

    const profile = await fetchInstagramProfile(TOKEN, fetcher)
    const subscription = await subscribeInstagramComments({
      accountId: ACCOUNT_ID,
      accessToken: TOKEN,
    }, fetcher)

    expect(profile.username).toBe("alidevlab")
    expect(subscription).toEqual({ active: true, subscribedFields: ["comments"] })
    expect(requests).toHaveLength(3)
    expect(requests.every((request) => request.authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(requests.every((request) => !request.url.includes(TOKEN))).toBe(true)
    expect(requests[1].method).toBe("POST")
    expect(requests[2].method).toBe("GET")
  })

  it("marks automation ready only when every safety check passes", () => {
    const incomplete = deriveInstagramAutomationHealth({
      connected: true,
      accountType: "MEDIA_CREATOR",
      grantedScopes: ["instagram_business_basic"],
      tokenHealth: "valid",
      webhookStatus: "missing",
      subscribedFields: [],
    })
    expect(incomplete.ready).toBe(false)
    expect(incomplete.missingScopes).toEqual(["instagram_business_manage_comments"])

    const ready = deriveInstagramAutomationHealth({
      connected: true,
      accountType: "MEDIA_CREATOR",
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_comments"],
      tokenHealth: "valid",
      webhookStatus: "active",
      subscribedFields: ["comments"],
    })
    expect(ready.ready).toBe(true)
    expect(ready.status).toBe("ready")
  })

  it("recognizes direct Instagram permission names and never exposes stored tokens", () => {
    const capabilities = deriveMetaCapabilities([
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_content_publish",
    ])
    expect(capabilities.instagram_basic).toBe(true)
    expect(capabilities.comments_manage).toBe(true)
    expect(capabilities.instagram_publish).toBe(true)

    const sanitized = sanitizeMetaAccountMetadataForClient({
      user_access_token: TOKEN,
      granted_scopes: ["instagram_business_basic"],
      connection_method: "instagram_login",
      webhook_subscription_status: "active",
      webhook_subscribed_fields: ["comments"],
    })
    expect(sanitized.user_access_token).toBeUndefined()
    expect(sanitized.connection_method).toBe("instagram_login")
  })

  it("does not include provider response bodies or credentials in API errors", async () => {
    const fetcher = vi.fn(async () => jsonResponse(400, {
      error: {
        code: 190,
        message: `Invalid token ${TOKEN}`,
      },
    })) as unknown as typeof fetch

    let caught: unknown
    try {
      await fetchInstagramProfile(TOKEN, fetcher)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(InstagramApiError)
    expect(String(caught)).not.toContain(TOKEN)
    expect(String(caught)).not.toContain("Invalid token")
  })

  it("turns callback outcomes into persistent, credential-safe UI notices", () => {
    const failed = getInstagramConnectionNotice(new URLSearchParams({
      error: "instagram_api_error",
      stage: "exchange_authorization_code",
      code: "OAuthException",
    }))
    expect(failed).toEqual({
      tone: "error",
      title: "Instagram connection did not complete",
      message: expect.stringContaining("Instagram app ID and Instagram app secret"),
      reference: "stage exchange_authorization_code · code OAuthException",
    })

    const connected = getInstagramConnectionNotice(new URLSearchParams({
      success: "instagram_connected",
    }))
    expect(connected?.tone).toBe("success")
    expect(connected?.message).toContain("comment webhook")

    expect(sanitizeInstagramDiagnosticValue(TOKEN)).toBeNull()
    expect(sanitizeInstagramDiagnosticValue("OAuthException")).toBe("OAuthException")
  })
})

describe("Instagram onboarding route safety", () => {
  const route = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

  it("binds login and all mutation routes to workspace integration permission", () => {
    for (const path of [
      "app/api/auth/instagram/login/route.ts",
      "app/api/auth/instagram/callback/route.ts",
      "app/api/auth/instagram/verify/route.ts",
      "app/api/auth/instagram/subscribe/route.ts",
      "app/api/auth/instagram/refresh/route.ts",
    ]) {
      expect(route(path)).toContain('requireWorkspacePermission')
      expect(route(path)).toContain('"integrations:write"')
    }
  })

  it("stores OAuth state in a short-lived httpOnly same-site cookie", () => {
    const source = route("app/api/auth/instagram/login/route.ts")
    expect(source).toContain("httpOnly: true")
    expect(source).toContain('sameSite: "lax"')
    expect(source).toContain("60 * 10")
    expect(source).not.toContain("NEXT_PUBLIC_INSTAGRAM_APP_ID")
  })

  it("records safe callback stages and returns persistent diagnostic references", () => {
    const callback = route("app/api/auth/instagram/callback/route.ts")
    const quickStart = route("components/onboarding/instagram-quick-start.tsx")
    expect(callback).toContain('"exchange_authorization_code"')
    expect(callback).toContain('"save_connection"')
    expect(callback).toContain('"Instagram connection callback failed"')
    expect(callback).not.toContain("error.message")
    expect(quickStart).toContain("Technical reference:")
  })

  it("preserves direct Instagram Login accounts when Facebook is disconnected", () => {
    const source = route("app/api/brand/social-accounts/route.ts")
    expect(source).toContain("metadata.connection_method !== 'instagram_login'")
    expect(source).toContain("platformsToDelete.push('instagram')")
  })
})
