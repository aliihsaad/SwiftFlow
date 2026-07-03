import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { redactSensitiveLogValue, redactSensitiveString } from "@/lib/security/redaction"
import { redactSensitiveString as redactEdgeSensitiveString } from "@/supabase/functions/_shared/log-redaction"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

describe("secret log redaction", () => {
  it("redacts tokens, bearer headers, API keys, OAuth codes, and sensitive query params", () => {
    const raw = [
      "https://graph.facebook.com/me?access_token=EAAB_REAL_TOKEN&code=oauth-code-123",
      "Authorization: Bearer sf_live_abcdefghijklmnop_secretsecretsecretsecretsecret",
      "refresh_token=sf_oauth_refresh.iv.tag.payload",
      "api_key=sk-real-openai-key-value",
      "input_token=page-token&client_secret=meta-secret",
    ].join(" ")

    const redacted = redactSensitiveString(raw)

    expect(redacted).toContain("access_token=[REDACTED]")
    expect(redacted).toContain("code=[REDACTED]")
    expect(redacted).toContain("Bearer [REDACTED]")
    expect(redacted).toContain("refresh_token=[REDACTED]")
    expect(redacted).toContain("api_key=[REDACTED]")
    expect(redacted).toContain("input_token=[REDACTED]")
    expect(redacted).toContain("client_secret=[REDACTED]")
    expect(redacted).not.toContain("EAAB_REAL_TOKEN")
    expect(redacted).not.toContain("oauth-code-123")
    expect(redacted).not.toContain("meta-secret")
  })

  it("redacts nested log objects by sensitive key name", () => {
    expect(redactSensitiveLogValue({
      ok: false,
      access_token: "raw-token",
      nested: {
        authorization: "Bearer raw",
        message: "failed at https://example.com/callback?code=raw-code",
      },
    })).toEqual({
      ok: false,
      access_token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        message: "failed at https://example.com/callback?code=[REDACTED]",
      },
    })
  })

  it("keeps the Deno Edge Function redactor behavior aligned with the app redactor", () => {
    const redacted = redactEdgeSensitiveString(
      "https://graph.facebook.com/me?access_token=raw&code=raw-code Authorization: Bearer raw",
    )

    expect(redacted).toContain("access_token=[REDACTED]")
    expect(redacted).toContain("code=[REDACTED]")
    expect(redacted).toContain("Bearer [REDACTED]")
    expect(redacted).not.toContain("raw-code")
  })

  it("uses redaction on high-risk Developer API, Meta OAuth, and Edge Function logs", () => {
    const metaCallback = source("app", "api", "auth", "meta", "callback", "route.ts")
    expect(metaCallback).toContain("redactSensitiveString")
    expect(metaCallback).toContain("redactSensitiveLogValue(error)")
    expect(metaCallback).toContain("encodeURIComponent(redactSensitiveString(pagesErrorText)")

    expect(source("lib", "developer-api", "http.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("lib", "developer-api", "audit.ts")).toContain("redactSensitiveLogValue(error)")
    // Developer API entitlements now delegate to the billing reader, which
    // owns the redacted error logging for entitlement reads.
    expect(source("lib", "billing", "entitlements.ts")).toContain("redactSensitiveLogValue(")
    expect(source("app", "api", "developer", "keys", "route.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("app", "api", "developer", "keys", "[id]", "route.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("app", "api", "developer", "access-model", "route.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("app", "api", "developer", "audit-logs", "route.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("app", "api", "developer", "v1", "posts", "route.ts")).toContain("redactSensitiveLogValue(error)")
    expect(source("app", "api", "assistant", "command", "route.ts")).toContain("redactSensitiveLogValue(error)")

    for (const file of [
      ["supabase", "functions", "automation-orchestrator", "index.ts"],
      ["supabase", "functions", "automation-worker-run", "index.ts"],
      ["supabase", "functions", "chat-assistant", "index.ts"],
      ["supabase", "functions", "generate-caption", "index.ts"],
      ["supabase", "functions", "generate-carousel", "index.ts"],
      ["supabase", "functions", "generate-ideas", "index.ts"],
      ["supabase", "functions", "generate-image", "index.ts"],
      ["supabase", "functions", "generate-message-reply", "index.ts"],
      ["supabase", "functions", "generate-reply", "index.ts"],
      ["supabase", "functions", "process-scheduled-posts", "index.ts"],
      ["supabase", "functions", "process-scheduled-executions", "index.ts"],
      ["supabase", "functions", "process-automations", "index.ts"],
      ["supabase", "functions", "process-automations", "graph-executor.ts"],
      ["supabase", "functions", "research-topic", "index.ts"],
      ["supabase", "functions", "sync-comments", "index.ts"],
      ["supabase", "functions", "sync-messages", "index.ts"],
      ["supabase", "functions", "sync-analytics", "index.ts"],
    ]) {
      const edgeSource = source(...file)
      expect(edgeSource).toContain("../_shared/log-redaction.ts")
      expect(edgeSource).toContain("redactSensitiveLogValue")
    }
  })
})
