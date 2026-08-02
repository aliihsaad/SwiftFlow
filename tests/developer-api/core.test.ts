import { describe, expect, it } from "vitest"
import {
  canRoleCreateDeveloperApiKey,
  getDeveloperApiCapabilities,
  normalizeDeveloperApiScopes,
  normalizeStoredDeveloperApiScopes,
  requireDeveloperApiScopes,
} from "@/lib/developer-api/scopes"
import { resolveDeveloperApiEntitlementFromInputs } from "@/lib/developer-api/entitlements"
import { createDeveloperApiToken, hashDeveloperApiToken } from "@/lib/developer-api/key-format"

describe("developer API scope and capability model", () => {
  it("only lets owners and admins create API keys", () => {
    expect(canRoleCreateDeveloperApiKey("owner")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("admin")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("editor")).toBe(false)
    expect(canRoleCreateDeveloperApiKey(null)).toBe(false)
  })

  it("normalizes active scopes and rejects retired publishing scopes", () => {
    expect(normalizeDeveloperApiScopes(["brand:read", "brand:read", "automations:create"])).toEqual([
      "brand:read",
      "automations:create",
    ])
    expect(() => normalizeDeveloperApiScopes(["posts:create"])).toThrow("Unsupported developer API scope")
    expect(normalizeStoredDeveloperApiScopes(["brand:read", "posts:create", "media:generate"])).toEqual(["brand:read"])
  })

  it("reports missing scopes for routes", () => {
    expect(requireDeveloperApiScopes(["brand:read"], ["brand:read"])).toEqual({ allowed: true })
    expect(requireDeveloperApiScopes(["brand:read"], ["automations:create"])).toEqual({
      allowed: false,
      missingScopes: ["automations:create"],
    })
  })

  it("turns engagement scopes into readable capabilities", () => {
    const capabilities = getDeveloperApiCapabilities([
      "brand:read",
      "automations:create",
      "analytics:read",
    ])
    expect(capabilities.summary).toEqual([
      "Read brand profile",
      "Create automations",
      "Read analytics",
    ])
    expect(capabilities.access.map((entry) => entry.area)).toEqual([
      "Brand profile",
      "Automations",
      "Analytics",
    ])
  })
})

describe("developer API entitlement mode", () => {
  it("supports preview, off, and paid-only modes", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("preview", false).allowed).toBe(true)
    expect(resolveDeveloperApiEntitlementFromInputs("off", true).allowed).toBe(false)
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", true).allowed).toBe(true)
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", false).allowed).toBe(false)
  })
})

describe("developer API keys", () => {
  it("generates and hashes bearer tokens", () => {
    const generated = createDeveloperApiToken()
    expect(generated.plaintext.startsWith("sf_live_")).toBe(true)
    expect(generated.prefix.length).toBeGreaterThan(8)
    expect(hashDeveloperApiToken(generated.plaintext, "test-pepper")).toHaveLength(64)
  })
})
