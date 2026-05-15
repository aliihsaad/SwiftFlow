import type { AssistantBriefing } from "./response-briefing"

export type AssistantQuickActionMode = "create" | "improve" | "analyze" | "operate" | "ask"
export type AssistantQuickActionFunction = "chat-assistant" | "generate-image" | "generate-ideas" | "generate-carousel"
export type AssistantQuickActionIntent =
  | "send"
  | "set_input"
  | "start_draft"
  | "start_image_flow"
  | "start_carousel_flow"
export type AssistantQuickActionTone = "cyan" | "rose" | "amber" | "emerald" | "violet"

export interface AssistantQuickAction {
  id: string
  label: string
  prompt: string
  intent: AssistantQuickActionIntent
  functionName: AssistantQuickActionFunction
  tone: AssistantQuickActionTone
  loadingLabel: string
  guidance?: string
  primary?: boolean
}

const MODE_ACTIONS: Record<AssistantQuickActionMode, AssistantQuickAction[]> = {
  create: [
    {
      id: "create-post-idea",
      label: "Post idea",
      prompt: "Create one strong social post idea for my brand, with hook, caption direction, and CTA.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Creating...",
      primary: true,
    },
    {
      id: "create-carousel",
      label: "Carousel",
      prompt: "",
      intent: "start_carousel_flow",
      functionName: "generate-carousel",
      tone: "violet",
      loadingLabel: "Preparing...",
      guidance: "What should the carousel be about?",
      primary: true,
    },
    {
      id: "create-image",
      label: "Image",
      prompt: "",
      intent: "start_image_flow",
      functionName: "generate-image",
      tone: "rose",
      loadingLabel: "Preparing...",
      guidance: "What should the image be about?",
      primary: true,
    },
    {
      id: "schedule-draft",
      label: "Schedule draft",
      prompt: "Draft a ready-to-schedule post for my next available content slot.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
      loadingLabel: "Drafting...",
    },
  ],
  improve: [
    {
      id: "improve-shorter",
      label: "Shorter",
      prompt: "Make this draft shorter while keeping the main point: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Ready",
      primary: true,
    },
    {
      id: "improve-hook",
      label: "Stronger hook",
      prompt: "Rewrite this with a stronger opening hook: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "rose",
      loadingLabel: "Ready",
      primary: true,
    },
    {
      id: "improve-voice",
      label: "Brand voice",
      prompt: "Rewrite this in my brand voice and keep it natural: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "violet",
      loadingLabel: "Ready",
      primary: true,
    },
    {
      id: "improve-cta",
      label: "Add CTA",
      prompt: "Add a clear CTA to this post without making it salesy: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "amber",
      loadingLabel: "Ready",
    },
  ],
  analyze: [
    {
      id: "analyze-recent-performance",
      label: "Recent performance",
      prompt: "Analyze my recent performance and suggest what to post next.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Analyzing...",
      primary: true,
    },
    {
      id: "analyze-best-time",
      label: "Best time",
      prompt: "Analyze my recent performance and recommend the best posting time to test next.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
      loadingLabel: "Checking...",
      primary: true,
    },
    {
      id: "analyze-top-posts",
      label: "Top posts",
      prompt: "Show what my top recent posts have in common and how to repeat that pattern.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
      loadingLabel: "Finding...",
      primary: true,
    },
    {
      id: "analyze-content-gaps",
      label: "Content gaps",
      prompt: "Find content gaps in my recent posting and recommend three specific posts to fill them.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "amber",
      loadingLabel: "Scanning...",
    },
  ],
  operate: [
    {
      id: "operate-drafts",
      label: "Drafts",
      prompt: "Inspect my drafts and tell me which ones need action.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Inspecting...",
      primary: true,
    },
    {
      id: "operate-scheduled",
      label: "Scheduled posts",
      prompt: "Inspect my scheduled posts and flag timing or content risks.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
      loadingLabel: "Inspecting...",
      primary: true,
    },
    {
      id: "operate-automations",
      label: "Automations",
      prompt: "Review my automations and tell me what is active, paused, or needs attention.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
      loadingLabel: "Reviewing...",
      primary: true,
    },
    {
      id: "operate-sync-analytics",
      label: "Sync analytics",
      prompt: "Refresh analytics context and summarize what changed.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "amber",
      loadingLabel: "Syncing...",
    },
  ],
  ask: [
    {
      id: "ask-explain",
      label: "Explain this",
      prompt: "Explain what I am looking at and what matters most.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Explaining...",
      primary: true,
    },
    {
      id: "ask-setup",
      label: "Setup help",
      prompt: "Help me check whether my workspace setup is complete.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
      loadingLabel: "Checking...",
      primary: true,
    },
    {
      id: "ask-capabilities",
      label: "What can I do?",
      prompt: "Tell me the most useful things you can do for this workspace right now.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
      loadingLabel: "Listing...",
      primary: true,
    },
  ],
}

export function getAssistantModeActions(mode: AssistantQuickActionMode): AssistantQuickAction[] {
  return MODE_ACTIONS[mode]
}

export function splitAssistantQuickActions(actions: AssistantQuickAction[], maxPrimary = 3) {
  const explicitPrimary = actions.filter((action) => action.primary)
  const primary = (explicitPrimary.length ? explicitPrimary : actions).slice(0, maxPrimary)
  const primaryIds = new Set(primary.map((action) => action.id))

  return {
    primary,
    secondary: actions.filter((action) => !primaryIds.has(action.id)),
  }
}

function getPrimaryRecommendation(briefing: AssistantBriefing): string | null {
  const postNext = briefing.sections.find((section) => section.title === "Post next")
  return postNext?.items[0]?.trim() || null
}

export function buildContextualAssistantActions(briefing: AssistantBriefing): AssistantQuickAction[] {
  const recommendation = getPrimaryRecommendation(briefing)
  if (!recommendation) return []

  return [
    {
      id: "generate-post",
      label: "Generate post",
      prompt: `Create a ready-to-publish social post based on this recommendation: "${recommendation}". Include caption, CTA, and hashtags.`,
      intent: "send",
      functionName: "chat-assistant",
      tone: "cyan",
      loadingLabel: "Generating...",
      primary: true,
    },
    {
      id: "make-carousel",
      label: "Make carousel",
      prompt: recommendation,
      intent: "start_carousel_flow",
      functionName: "generate-carousel",
      tone: "violet",
      loadingLabel: "Preparing...",
      primary: true,
    },
    {
      id: "create-image",
      label: "Create image",
      prompt: recommendation,
      intent: "start_image_flow",
      functionName: "generate-image",
      tone: "rose",
      loadingLabel: "Preparing...",
      primary: true,
    },
    {
      id: "start-draft",
      label: "Start draft",
      prompt: recommendation,
      intent: "start_draft",
      functionName: "chat-assistant",
      tone: "emerald",
      loadingLabel: "Opening...",
    },
  ]
}
