import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSupabaseFunctionHeaders,
  getSupabaseServiceRoleKey,
  looksLikeSupabaseJwt,
  requireSupabaseServiceRoleKey,
} from "@/lib/supabase/service-key"

describe("Supabase service key helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("prefers the explicit service role key over the legacy service key alias", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJrole.payload.signature")
    vi.stubEnv("SUPABASE_SERVICE_KEY", "legacy-service-key")

    expect(getSupabaseServiceRoleKey()).toBe("eyJrole.payload.signature")
    expect(requireSupabaseServiceRoleKey()).toBe("eyJrole.payload.signature")
  })

  it("throws a clear server config error when no service key is configured", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_KEY", "")

    expect(getSupabaseServiceRoleKey()).toBeUndefined()
    expect(() => requireSupabaseServiceRoleKey()).toThrow(
      "Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY env variable",
    )
  })

  it("builds internal Edge Function headers with the service role JWT when available", () => {
    const serviceRoleJwt = "eyJservice.payload.signature"
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleJwt)
    vi.stubEnv("SUPABASE_SERVICE_KEY", "legacy-service-key")

    expect(buildSupabaseFunctionHeaders()).toEqual({
      "Content-Type": "application/json",
      apikey: serviceRoleJwt,
      Authorization: `Bearer ${serviceRoleJwt}`,
    })
  })

  it("uses the anon JWT for gateway auth when the selected service key is not a JWT", () => {
    const anonJwt = "eyJanon.payload.signature"
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonJwt)

    expect(buildSupabaseFunctionHeaders("sb_secret_service_key")).toEqual({
      "Content-Type": "application/json",
      apikey: "sb_secret_service_key",
      Authorization: `Bearer ${anonJwt}`,
    })
  })

  it("omits Authorization when neither selected service key nor anon key is a JWT", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-not-jwt")

    expect(looksLikeSupabaseJwt("eyJheader.payload.signature")).toBe(true)
    expect(looksLikeSupabaseJwt("sb_secret_service_key")).toBe(false)
    expect(buildSupabaseFunctionHeaders("sb_secret_service_key")).toEqual({
      "Content-Type": "application/json",
      apikey: "sb_secret_service_key",
    })
  })
})
