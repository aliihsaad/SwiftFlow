import type { AssistantBriefing } from "./response-briefing"

export type AssistantQuickActionMode = "create" | "improve" | "analyze" | "operate" | "ask"
export type AssistantQuickActionFunction = "chat-assistant" | "generate-image" | "generate-ideas" | "generate-carousel"
export type AssistantQuickActionIntent = "send" | "set_input" | "start_draft"
export type AssistantQuickActionTone = "cyan" | "rose" | "amber" | "emerald" | "violet"

export interface AssistantQuickAction {
  id: string
  label: string
  prompt: string
  intent: AssistantQuickActionIntent
  functionName: AssistantQuickActionFunction
  tone: AssistantQuickActionTone
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
    },
    {
      id: "create-carousel",
      label: "Carousel",
      prompt: "Create a 5-slide Instagram carousel based on my current best content themes.",
      intent: "send",
      functionName: "generate-carousel",
      tone: "violet",
    },
    {
      id: "create-image",
      label: "Image",
      prompt: "Create a polished social media image concept for my next post.",
      intent: "send",
      functionName: "generate-image",
      tone: "rose",
    },
    {
      id: "schedule-draft",
      label: "Schedule draft",
      prompt: "Draft a ready-to-schedule post for my next available content slot.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
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
    },
    {
      id: "improve-hook",
      label: "Stronger hook",
      prompt: "Rewrite this with a stronger opening hook: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "rose",
    },
    {
      id: "improve-voice",
      label: "Brand voice",
      prompt: "Rewrite this in my brand voice and keep it natural: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "violet",
    },
    {
      id: "improve-cta",
      label: "Add CTA",
      prompt: "Add a clear CTA to this post without making it salesy: ",
      intent: "set_input",
      functionName: "chat-assistant",
      tone: "amber",
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
    },
    {
      id: "analyze-best-time",
      label: "Best time",
      prompt: "Analyze my recent performance and recommend the best posting time to test next.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
    },
    {
      id: "analyze-top-posts",
      label: "Top posts",
      prompt: "Show what my top recent posts have in common and how to repeat that pattern.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
    },
    {
      id: "analyze-content-gaps",
      label: "Content gaps",
      prompt: "Find content gaps in my recent posting and recommend three specific posts to fill them.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "amber",
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
    },
    {
      id: "operate-scheduled",
      label: "Scheduled posts",
      prompt: "Inspect my scheduled posts and flag timing or content risks.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
    },
    {
      id: "operate-automations",
      label: "Automations",
      prompt: "Review my automations and tell me what is active, paused, or needs attention.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
    },
    {
      id: "operate-sync-analytics",
      label: "Sync analytics",
      prompt: "Refresh analytics context and summarize what changed.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "amber",
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
    },
    {
      id: "ask-setup",
      label: "Setup help",
      prompt: "Help me check whether my workspace setup is complete.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "emerald",
    },
    {
      id: "ask-capabilities",
      label: "What can I do?",
      prompt: "Tell me the most useful things you can do for this workspace right now.",
      intent: "send",
      functionName: "chat-assistant",
      tone: "violet",
    },
  ],
}

export function getAssistantModeActions(mode: AssistantQuickActionMode): AssistantQuickAction[] {
  return MODE_ACTIONS[mode]
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
    },
    {
      id: "make-carousel",
      label: "Make carousel",
      prompt: `Create a 5-slide Instagram carousel about this recommendation: "${recommendation}".`,
      intent: "send",
      functionName: "generate-carousel",
      tone: "violet",
    },
    {
      id: "create-image",
      label: "Create image",
      prompt: `Create a polished social media image for this post idea: "${recommendation}".`,
      intent: "send",
      functionName: "generate-image",
      tone: "rose",
    },
    {
      id: "start-draft",
      label: "Start draft",
      prompt: recommendation,
      intent: "start_draft",
      functionName: "chat-assistant",
      tone: "emerald",
    },
  ]
}
