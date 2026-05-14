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
      supportedTriggers: SUPPORTED_CANVAS_TRIGGER_TYPES,
      temporarilyDisabledNodeTypes: ["trigger_story_mention", "action_http_request"],
      nodeCatalog: NODE_CATALOG,
    }),
  )
}
