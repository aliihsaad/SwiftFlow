import { NextRequest, NextResponse } from "next/server"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import { listDeveloperAutomationTemplates } from "@/lib/developer-api/automation-templates"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "automation_templates.read",
      route: "/api/developer/v1/automation-templates",
    },
    async () => NextResponse.json({
      templates: listDeveloperAutomationTemplates(),
      guidance: "Prefer swiftflow_create_automation_from_template for connector-created automations. Use raw workflow_graph only for advanced custom flows.",
    }),
  )
}
