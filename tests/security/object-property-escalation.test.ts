import { describe, expect, it } from "vitest"
import {
  sanitizeAssistantInvokePayload,
  sanitizePartialBrandProfilePayload,
  sanitizeWorkspaceSettingsPayload,
} from "@/lib/security/phase1-validation"

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222"

describe("object-property escalation guards", () => {
  it("keeps automation reply payloads allowlisted", () => {
    const payload = sanitizeAssistantInvokePayload("generate-reply", {
      workspaceId: WORKSPACE_ID,
      comment: "  hello  ",
      authorUsername: "ali",
      postContent: "post",
      platform: "instagram",
      access_token: "secret",
      workspace_id: "attacker",
    })
    expect(payload).toEqual({
      workspaceId: WORKSPACE_ID,
      comment: "hello",
      authorUsername: "ali",
      postContent: "post",
      platform: "instagram",
    })
  })

  it("keeps partial brand updates field-allowlisted", () => {
    const payload = sanitizePartialBrandProfilePayload({
      workspace_id: "attacker",
      id: "attacker",
      business_name: "SwiftFlow",
      brand_voice: "Helpful",
      brand_colors: { primary: "#112233", invalid: "javascript:alert(1)" },
    })
    expect(payload).toMatchObject({
      business_name: "SwiftFlow",
      brand_voice: "Helpful",
      brand_colors: { primary: "#112233" },
    })
    expect(payload).not.toHaveProperty("workspace_id")
    expect(payload).not.toHaveProperty("id")
  })

  it("keeps workspace settings updates allowlisted", () => {
    const payload = sanitizeWorkspaceSettingsPayload({
      workspaceId: WORKSPACE_ID,
      ai_provider: "openrouter",
      ai_temperature: 2,
      ai_max_tokens: 8192,
      timezone: "Europe/Berlin",
      floating_assistant_enabled: true,
      ai_image_model_name: "retired",
    })
    expect(payload.workspaceId).toBe(WORKSPACE_ID)
    expect(payload.settings).toMatchObject({
      ai_provider: "openrouter",
      ai_temperature: 2,
      ai_max_tokens: 8192,
      timezone: "Europe/Berlin",
    })
    expect(payload.settings).not.toHaveProperty("floating_assistant_enabled")
    expect(payload.settings).not.toHaveProperty("ai_image_model_name")
  })
})
