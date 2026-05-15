import type { AssistantAction, AssistantMode } from "@/app/dashboard/assistant/assistant-types"
import type { AssistantContextKind, AssistantContextPack, AssistantContextReceipt } from "./context-types"

export function contextKindsForIntent(mode: AssistantMode, action: AssistantAction): AssistantContextKind[] {
  if (action === "analyze_workspace") return ["brand", "accounts", "analytics", "content"]
  if (action === "inspect_posts") return ["brand", "accounts", "content"]
  if (action === "inspect_automations") return ["brand", "accounts", "automations"]
  if (action === "improve_text") return ["brand", "accounts", "content"]
  if (mode === "operate") return ["brand", "accounts", "content", "automations"]
  if (mode === "ask") return ["brand", "accounts", "content"]
  return ["brand", "accounts", "content"]
}

export function summarizeAssistantContext(context: AssistantContextPack): AssistantContextReceipt {
  const pieces: string[] = []
  if (context.brand?.businessName) pieces.push(context.brand.businessName)
  if (context.content?.recentPosts?.length) pieces.push(`${context.content.recentPosts.length} recent posts`)
  if (context.analytics) pieces.push(`${context.analytics.range} analytics`)
  if (context.automations) pieces.push(`${context.automations.activeCount} active automations`)
  if (context.accounts) pieces.push(`${context.accounts.connectedCount} connected accounts`)

  return {
    label: pieces.length ? `Used ${pieces.join(", ")}` : "Used workspace context",
    packs: context.requestedKinds,
    warnings: context.warnings,
    analyticsSyncReason: context.analytics?.sync.reason,
  }
}
