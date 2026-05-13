import { describe, expect, it } from "vitest"
import {
  sanitizeBrandProfilePayload,
  sanitizePartialBrandProfilePayload,
} from "@/lib/security/phase1-validation"
import { handleDeveloperMcpJsonRpc } from "@/lib/developer-api/mcp"

describe("developer API brand profile partial updates", () => {
  it("does not default omitted brand colors in partial payloads", () => {
    expect(sanitizeBrandProfilePayload({ business_name: "Restored Brand" })).toMatchObject({
      business_name: "Restored Brand",
      brand_colors: {
        enabled: true,
        primary: "#000000",
        secondary: "#666666",
        accent: "#0066CC",
      },
    })

    expect(sanitizePartialBrandProfilePayload({ business_name: "Restored Brand" })).toEqual({
      business_name: "Restored Brand",
    })
  })

  it("only sanitizes brand color keys that are explicitly provided", () => {
    expect(sanitizePartialBrandProfilePayload({
      brand_colors: {
        primary: "#ff00aa",
        secondary: "not-a-color",
      },
    })).toEqual({
      brand_colors: {
        primary: "#ff00aa",
      },
    })
  })

  it("maps ChatGPT brand profile updates to PATCH so omitted fields are preserved", async () => {
    const calls: unknown[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "brand-update",
      method: "tools/call",
      params: {
        name: "swiftflow_update_brand_profile",
        arguments: {
          business_name: "Restored Brand",
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return {
          brandProfile: {
            business_name: "Restored Brand",
            brand_colors: { primary: "#123456", secondary: "#abcdef", accent: "#101010" },
          },
        }
      },
    })

    expect(calls).toEqual([{
      method: "PATCH",
      path: "/api/developer/v1/brand-profile",
      body: {
        business_name: "Restored Brand",
      },
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "brand-update",
      result: {
        structuredContent: {
          brandProfile: {
            brand_colors: { primary: "#123456", secondary: "#abcdef", accent: "#101010" },
          },
        },
      },
    })
  })
})
