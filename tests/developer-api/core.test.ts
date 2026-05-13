import { describe, expect, it } from "vitest"
import {
  canRoleCreateDeveloperApiKey,
  getDeveloperApiCapabilities,
  normalizeDeveloperApiScopes,
  requireDeveloperApiScopes,
} from "@/lib/developer-api/scopes"
import { resolveDeveloperApiEntitlementFromInputs } from "@/lib/developer-api/entitlements"
import { createDeveloperApiToken, hashDeveloperApiToken, parseDeveloperApiTokenPrefix } from "@/lib/developer-api/key-format"

describe("developer API scope and capability model", () => {
  it("only lets owners and admins create API keys", () => {
    expect(canRoleCreateDeveloperApiKey("owner")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("admin")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("editor")).toBe(false)
    expect(canRoleCreateDeveloperApiKey("viewer")).toBe(false)
    expect(canRoleCreateDeveloperApiKey(null)).toBe(false)
  })

  it("normalizes scopes and rejects unknown access", () => {
    expect(normalizeDeveloperApiScopes(["brand:read", "brand:read", "brand:write"])).toEqual([
      "brand:read",
      "brand:write",
    ])
    expect(() => normalizeDeveloperApiScopes(["billing:write"])).toThrow("Unsupported developer API scope: billing:write")
  })

  it("reports missing scopes for routes", () => {
    expect(requireDeveloperApiScopes(["brand:read"], ["brand:read"])).toEqual({ allowed: true })
    expect(requireDeveloperApiScopes(["brand:read"], ["brand:write"])).toEqual({
      allowed: false,
      missingScopes: ["brand:write"],
    })
  })

  it("turns scopes into readable access capabilities for owners and admins", () => {
    const capabilities = getDeveloperApiCapabilities(["brand:read", "brand:write", "posts:draft:create"])

    expect(capabilities.summary).toEqual([
      "Read brand profile",
      "Edit brand profile",
      "Create draft posts",
    ])
    expect(capabilities.access).toContainEqual({
      area: "Brand profile",
      level: "write",
      description: "Read and update workspace brand profile fields.",
    })
    expect(capabilities.access).toContainEqual({
      area: "Posts",
      level: "write",
      description: "Create draft posts without publishing or scheduling externally.",
    })
  })
})

describe("developer API entitlement mode", () => {
  it("allows full API use in preview mode before payments are live", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("preview", false)).toEqual({
      allowed: true,
      mode: "preview",
      reason: "preview",
    })
  })

  it("is ready to switch to paid-only enforcement later", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", false)).toEqual({
      allowed: false,
      mode: "paid_only",
      reason: "paid_plan_required",
    })
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", true)).toEqual({
      allowed: true,
      mode: "paid_only",
      reason: "allowed",
    })
  })
})

describe("developer API keys", () => {
  it("generates a one-time bearer token with a searchable prefix", () => {
    const token = createDeveloperApiToken()

    expect(token.plaintext).toMatch(/^sf_live_[A-Za-z0-9_-]{10,}_[A-Za-z0-9_-]{32,}$/)
    expect(token.prefix).toMatch(/^sf_live_[A-Za-z0-9_-]{10,}$/)
    expect(parseDeveloperApiTokenPrefix(token.plaintext)).toBe(token.prefix)
  })

  it("hashes tokens with a server-side pepper", () => {
    const token = createDeveloperApiToken()
    const hash = hashDeveloperApiToken(token.plaintext, "pepper-a")

    expect(hash).not.toContain(token.plaintext)
    expect(hash).toBe(hashDeveloperApiToken(token.plaintext, "pepper-a"))
    expect(hash).not.toBe(hashDeveloperApiToken(token.plaintext, "pepper-b"))
  })
})
