import type { AutomationWizardState } from "./types"

function triggerText(state: AutomationWizardState): string {
  if (state.triggerType === "trigger_new_comment") {
    const filter =
      state.filters.triggerType === "keywords" && state.filters.keywords.length
        ? ` with ${state.filters.keywords.map((keyword) => `"${keyword}"`).join(", ")}`
        : ""

    return `someone comments${filter}`
  }

  if (state.triggerType === "trigger_new_message") return "someone sends a message"
  if (state.triggerType === "trigger_new_follower") return "someone follows the account"
  if (state.triggerType === "trigger_cron") return "the schedule is due"
  if (state.triggerType === "trigger_story_mention") return "someone mentions the account in a story"

  return "someone replies to a story"
}

function actionText(state: AutomationWizardState): string {
  const parts: string[] = []

  if (state.delay.enabled) {
    parts.push(`wait ${state.delay.durationValue} ${state.delay.durationUnit}`)
  }

  if (state.ai.enabled) {
    parts.push("generate an AI response")
  }

  for (const action of state.actions.filter((item) => item.enabled)) {
    if (action.type === "action_reply_comment") parts.push("reply publicly")
    if (action.type === "action_send_dm") parts.push("send a DM")
    if (action.type === "action_private_reply") parts.push("send a private reply")
    if (action.type === "action_send_email") parts.push("send an email alert")
    if (action.type === "action_http_request") parts.push("call an external webhook")
    if (action.type === "action_condition") parts.push("check the configured condition")
  }

  return parts.length ? parts.join(", then ") : "record the event"
}

export function summarizeAutomationWizard(state: AutomationWizardState): string {
  const platform = state.account.platform === "facebook" ? "Facebook" : "Instagram"

  return `When ${triggerText(state)} on ${platform}, ${actionText(state)}.`
}
