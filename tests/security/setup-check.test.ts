import { describe, expect, it } from "vitest"

import {
  buildManualMetaUrls,
  extractFunctionNames,
  extractMigrationVersions,
  extractSecretNames,
  extractSupabaseProjectRefs,
  extractVercelEnvNames,
  findMissingEnv,
  isConfiguredValue,
  parseJsonOutput,
  supabaseRefFromUrl,
} from "../../scripts/setup-check.mjs"

describe("managed setup preflight helpers", () => {
  it("accepts either supported Supabase service-role variable name", () => {
    const base = {
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "configured-anon-key",
      NEXT_PUBLIC_APP_URL: "https://swiftflow.example.com",
      APP_SECRETS_ENCRYPTION_KEY: "configured-encryption-key",
      INSTAGRAM_APP_ID: "123456789",
      INSTAGRAM_APP_SECRET: "configured-instagram-secret",
      META_WEBHOOK_VERIFY_TOKEN: "configured-webhook-token",
    }

    expect(findMissingEnv({ ...base, SUPABASE_SERVICE_KEY: "configured-service-key" })).toEqual([])
    expect(findMissingEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: "configured-service-key" })).toEqual([])
    expect(findMissingEnv(base)).toContain("one of SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY")
  })

  it("rejects empty and obvious placeholder values", () => {
    expect(isConfiguredValue("replace-with-a-secret")).toBe(false)
    expect(isConfiguredValue("your-key")).toBe(false)
    expect(isConfiguredValue("xxxxx")).toBe(false)
    expect(isConfiguredValue("a-real-looking-value")).toBe(true)
  })

  it("parses CLI JSON and extracts names without values", () => {
    const vercel = extractVercelEnvNames(parseJsonOutput('{"envs":[{"key":"NEXT_PUBLIC_APP_URL"}]}'))
    const functions = extractFunctionNames([{ slug: "scheduler-tick" }, { name: "sync-comments" }])
    const secrets = extractSecretNames([{ name: "INSTAGRAM_APP_SECRET" }])

    expect([...vercel]).toEqual(["NEXT_PUBLIC_APP_URL"])
    expect([...functions]).toEqual(["scheduler-tick", "sync-comments"])
    expect([...secrets]).toEqual(["INSTAGRAM_APP_SECRET"])
  })

  it("matches linked Supabase projects across current CLI shapes", () => {
    const projects = extractSupabaseProjectRefs([
      { id: "abcdefghijklmnopqrst", name: "SwiftFlow", status: "ACTIVE_HEALTHY" },
    ])
    expect(projects.get("abcdefghijklmnopqrst")?.name).toBe("SwiftFlow")
  })

  it("extracts only valid timestamped migrations", () => {
    expect(extractMigrationVersions([
      "20260221050000_baseline_schema.sql",
      "README.md",
      "not_a_migration.sql",
    ])).toEqual(["20260221050000"])
  })

  it("derives safe provider URLs from the public app URL", () => {
    expect(buildManualMetaUrls("https://swiftflow.example.com/")).toEqual({
      oauthCallback: "https://swiftflow.example.com/api/auth/instagram/callback",
      webhookCallback: "https://swiftflow.example.com/api/webhooks/instagram",
    })
    expect(supabaseRefFromUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe("abcdefghijklmnopqrst")
  })
})
