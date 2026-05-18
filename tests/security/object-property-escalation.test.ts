import { describe, expect, it } from "vitest"
import {
  sanitizeChatSessionPayload,
  sanitizePartialBrandProfilePayload,
  sanitizePostPayload,
  sanitizeWorkspaceSettingsPayload,
} from "@/lib/security/phase1-validation"

const POST_ID = "11111111-1111-4111-8111-111111111111"
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222"

describe("object-property escalation guards", () => {
  it("does not let post payloads mass-assign workspace, user, or publish result fields", () => {
    const payload = sanitizePostPayload({
      id: POST_ID,
      workspace_id: "attacker-workspace",
      user_id: "attacker-user",
      created_by_user_id: "attacker-user",
      last_publish_results: [{ access_token: "raw" }],
      platforms: ["instagram", "facebook", "linkedin"],
      captionByPlatform: {
        instagram: "Instagram caption",
        facebook: "Facebook caption",
        linkedin: "Should be ignored",
      },
      mediaUrls: ["https://cdn.example.com/post.png"],
      status: "published",
      scheduledAt: "2026-06-01T12:00:00.000Z",
    })

    expect(payload).toEqual({
      id: POST_ID,
      platforms: ["instagram", "facebook"],
      captionByPlatform: {
        instagram: "Instagram caption",
        facebook: "Facebook caption",
      },
      mediaUrls: ["https://cdn.example.com/post.png"],
      status: "published",
      scheduledAt: "2026-06-01T12:00:00.000Z",
    })
    expect(payload).not.toHaveProperty("workspace_id")
    expect(payload).not.toHaveProperty("user_id")
    expect(payload).not.toHaveProperty("last_publish_results")
  })

  it("rejects private, local, credentialed, and malformed media URLs", () => {
    const basePayload = {
      platforms: ["instagram"],
      captionByPlatform: { instagram: "Caption" },
      status: "draft",
    }

    for (const mediaUrl of [
      "http://127.0.0.1:54321/private.png",
      "http://localhost/private.png",
      "https://user:pass@example.com/private.png",
      "file:///etc/passwd",
      "not-a-url",
    ]) {
      expect(() => sanitizePostPayload({ ...basePayload, mediaUrls: [mediaUrl] })).toThrow("Invalid media URL")
    }
  })

  it("keeps partial brand profile updates field-allowlisted and color-only safe", () => {
    const payload = sanitizePartialBrandProfilePayload({
      workspace_id: "attacker-workspace",
      user_id: "attacker-user",
      status: "admin",
      business_name: "AIdevlab",
      brand_colors: {
        primary: "#050505",
        secondary: "not-a-color",
        accent: "#00E5FF",
        access_token: "raw-token",
      },
      services: [
        { name: "SaaS builds", description: "Production app delivery", secret: "raw" },
        { name: "", description: "ignored" },
      ],
      unknown_field: "ignored",
    })

    expect(payload).toEqual({
      business_name: "AIdevlab",
      brand_colors: {
        primary: "#050505",
        accent: "#00E5FF",
      },
      services: [
        { name: "SaaS builds", description: "Production app delivery" },
      ],
    })
  })

  it("keeps chat-session writes scoped to title and sanitized messages only", () => {
    const payload = sanitizeChatSessionPayload({
      workspace_id: "attacker-workspace",
      user_id: "attacker-user",
      title: "Launch plan",
      messages: [
        {
          role: "system",
          content: "Hidden prompt",
          type: "analysis",
          data: {
            ok: true,
            constructor: { prototype: { polluted: true } },
          },
        },
      ],
      status: "published",
    })

    expect(payload).toEqual({
      title: "Launch plan",
      messages: [
        {
          role: "user",
          content: "Hidden prompt",
          type: "analysis",
          data: { ok: true },
        },
      ],
    })
  })

  it("keeps workspace settings updates allowlisted even when a workspace id is supplied", () => {
    const payload = sanitizeWorkspaceSettingsPayload({
      workspaceId: WORKSPACE_ID,
      workspace_id: "attacker-workspace",
      user_id: "attacker-user",
      service_role: "raw-secret",
      ai_provider: "openrouter",
      ai_temperature: 99,
      ai_max_tokens: 1_000_000,
      timezone: "Europe/Berlin",
      unsupported: "ignored",
    })

    expect(payload).toEqual({
      workspaceId: WORKSPACE_ID,
      settings: {
        ai_provider: "openrouter",
        ai_temperature: 2,
        ai_max_tokens: 8192,
        timezone: "Europe/Berlin",
      },
    })
  })
})
