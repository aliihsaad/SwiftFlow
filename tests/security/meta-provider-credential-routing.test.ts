import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getMetaGraphApiBaseUrl,
  toMetaGraphFormBody,
} from "../../supabase/functions/_shared/meta-graph.ts"
import {
  deriveMetaCapabilities,
} from "../../supabase/functions/_shared/meta-account.ts"

function stubDenoEnv(values: Record<string, string>) {
  vi.stubGlobal("Deno", {
    env: {
      get(name: string) {
        return values[name]
      },
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Meta provider credential routing", () => {
  it("uses the Instagram Graph host for direct Instagram Login accounts", () => {
    expect(getMetaGraphApiBaseUrl("instagram_login"))
      .toBe("https://graph.instagram.com/v25.0")
    expect(getMetaGraphApiBaseUrl("facebook_login"))
      .toBe("https://graph.facebook.com/v25.0")
    expect(getMetaGraphApiBaseUrl())
      .toBe("https://graph.facebook.com/v25.0")
  })

  it("routes Direct Instagram analytics through the connection-specific Graph host", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "sync-analytics", "index.ts"),
      "utf8",
    )
    const routingCalls = source.match(
      /getMetaGraphApiBaseUrl\(account\.metadata\?\.connection_method\)/g,
    ) || []

    expect(routingCalls).toHaveLength(3)
    expect(source).toContain("const basicUrl = `${instagramGraphUrl}/")
    expect(source).toContain("const listUrl = `${instagramGraphUrl}/")
    expect(source).toContain("const url = `${instagramGraphUrl}/")
  })

  it("signs each token with the secret belonging to its connection method", async () => {
    const accessToken = "test-access-token"
    const metaSecret = "meta-app-secret"
    const instagramSecret = "instagram-app-secret"
    stubDenoEnv({
      META_APP_SECRET: metaSecret,
      INSTAGRAM_APP_SECRET: instagramSecret,
    })

    const facebookBody = await toMetaGraphFormBody(
      { access_token: accessToken },
      accessToken,
      { connectionMethod: "facebook_login" },
    )
    const instagramBody = await toMetaGraphFormBody(
      { access_token: accessToken },
      accessToken,
      { connectionMethod: "instagram_login" },
    )

    expect(facebookBody.get("appsecret_proof")).toBe(
      createHmac("sha256", metaSecret).update(accessToken).digest("hex"),
    )
    expect(instagramBody.get("appsecret_proof")).toBe(
      createHmac("sha256", instagramSecret).update(accessToken).digest("hex"),
    )
  })

  it("recognizes direct Instagram Login business scopes", () => {
    const capabilities = deriveMetaCapabilities([
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
    ])

    expect(capabilities.instagram_basic).toBe(true)
    expect(capabilities.instagram_publish).toBe(true)
    expect(capabilities.comments_manage).toBe(true)
    expect(capabilities.messages_manage).toBe(true)
  })
})
