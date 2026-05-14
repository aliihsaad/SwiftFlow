import { NextRequest, NextResponse } from "next/server"
import {
  NODE_CATALOG,
  SUPPORTED_CANVAS_TRIGGER_TYPES,
} from "@/types/automation-graph"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "automation_node_catalog.read",
      route: "/api/developer/v1/automation-node-catalog",
    },
    async () => NextResponse.json({
      graphShape: {
        nodes: "Array of React Flow nodes. Each node needs id, type, position, and data.",
        nodeData: "data must include type, label, and config. Trigger config must include social_account_id.",
        edges: "Array of React Flow edges using source and target node ids. Condition branches may use sourceHandle true or false.",
      },
      configRequirements: {
        trigger_new_comment: {
          required: ["social_account_id", "post_id"],
          optional: ["platform", "trigger_type", "keywords", "post_thumbnail_url", "post_caption"],
        },
        trigger_new_message: {
          required: ["social_account_id"],
          optional: ["platform", "trigger_type", "keywords"],
        },
        trigger_story_reply: {
          required: ["social_account_id"],
          optional: [],
        },
        action_delay: {
          required: ["duration_value", "duration_unit"],
          aliasesAccepted: ["duration", "unit"],
          durationUnits: ["seconds", "minutes", "hours", "days"],
        },
        action_ai_response: {
          required: [],
          optional: ["use_global_settings", "max_tokens", "preset_goal", "tone", "length", "language", "emoji_level", "custom_instructions"],
        },
        action_reply_comment: {
          required: ["use_ai_response or messages"],
          optional: ["messages"],
        },
        action_send_dm: {
          required: ["opening_message or use_ai_response"],
          optional: ["button_text", "link_url", "link_message", "fallback_to_private_reply_on_failure"],
        },
        action_private_reply: {
          required: ["message or use_ai_response"],
          optional: [],
        },
      },
      supportedTriggers: SUPPORTED_CANVAS_TRIGGER_TYPES,
      temporarilyDisabledNodeTypes: ["trigger_story_mention", "action_http_request"],
      nodeCatalog: NODE_CATALOG,
    }),
  )
}
