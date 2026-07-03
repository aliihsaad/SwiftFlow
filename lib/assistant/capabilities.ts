import type {
  AssistantAction,
  AssistantMode,
} from "@/app/dashboard/assistant/assistant-types"

export type AssistantSurface = "full" | "floating_readonly"

const FLOATING_SURFACE_ALIASES = new Set(["floating", "floating_readonly"])
const FLOATING_READONLY_MODES = new Set<AssistantMode>(["ask", "analyze", "operate"])
const FLOATING_READONLY_ACTIONS = new Set<AssistantAction>([
  "general_chat",
  "analyze_workspace",
  "inspect_posts",
  "inspect_automations",
])

export function normalizeAssistantSurface(value: unknown): AssistantSurface {
  return typeof value === "string" && FLOATING_SURFACE_ALIASES.has(value)
    ? "floating_readonly"
    : "full"
}

export function isFloatingReadonlySurface(surface: AssistantSurface): boolean {
  return surface === "floating_readonly"
}

export function assertAssistantSurfaceCapability({
  surface,
  mode,
  action,
  functionName,
}: {
  surface: AssistantSurface
  mode?: AssistantMode
  action?: AssistantAction
  functionName: string
}) {
  if (!isFloatingReadonlySurface(surface)) return

  if (functionName !== "chat-assistant") {
    throw new Error("Floating assistant only supports read-only chat")
  }

  if (mode && !FLOATING_READONLY_MODES.has(mode)) {
    throw new Error("Floating assistant only supports read-only questions and analysis")
  }

  if (action && !FLOATING_READONLY_ACTIONS.has(action)) {
    throw new Error("Floating assistant only supports read-only questions and analysis")
  }
}
