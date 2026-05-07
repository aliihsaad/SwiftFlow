"use client"

import type { Dispatch, SetStateAction } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  AutomationWizardState,
  WizardActionConfig,
  WizardActionType,
} from "@/lib/automation-wizard/types"

const ACTION_OPTIONS: Array<{
  type: WizardActionType
  label: string
  description: string
}> = [
  {
    type: "action_ai_response",
    label: "AI response",
    description: "Generate response text before the next action.",
  },
  {
    type: "action_reply_comment",
    label: "Reply to comment",
    description: "Post a public reply on the triggering comment.",
  },
  {
    type: "action_send_dm",
    label: "Send DM",
    description: "Send a direct message to the person who triggered this.",
  },
  {
    type: "action_private_reply",
    label: "Private reply",
    description: "Reply privately to a comment trigger.",
  },
  {
    type: "action_delay",
    label: "Delay",
    description: "Wait before continuing the automation.",
  },
  {
    type: "action_condition",
    label: "Condition",
    description: "Check a simple rule before later settings are added.",
  },
  {
    type: "action_send_email",
    label: "Send email",
    description: "Send an internal alert or notification email.",
  },
  {
    type: "action_http_request",
    label: "HTTP request",
    description: "Call an external webhook or API endpoint.",
  },
]

function defaultActionConfig(type: WizardActionType): WizardActionConfig {
  switch (type) {
    case "action_ai_response":
      return { type, enabled: true }
    case "action_reply_comment":
      return { type, enabled: true, messages: ["Thanks for your comment."] }
    case "action_send_dm":
      return { type, enabled: true, openingMessage: "Thanks for reaching out." }
    case "action_private_reply":
      return { type, enabled: true, message: "Thanks for your comment." }
    case "action_delay":
      return { type, enabled: true }
    case "action_condition":
      return {
        type,
        enabled: true,
        conditionType: "keyword_match",
        conditionOperator: "contains",
        conditionKeywords: [],
      }
    case "action_send_email":
      return {
        type,
        enabled: true,
        recipientEmail: "",
        emailSubject: "Automation alert",
        emailBody: "An automation event was triggered.",
      }
    case "action_http_request":
      return { type, enabled: true, httpMethod: "POST", httpUrl: "", httpHeaders: {} }
  }
}

function hasAction(actions: WizardActionConfig[], type: WizardActionType): boolean {
  return actions.some((action) => action.type === type && action.enabled)
}

export function ActionStep({
  state,
  setState,
}: {
  state: AutomationWizardState
  setState: Dispatch<SetStateAction<AutomationWizardState>>
}) {
  const selectedCount =
    state.actions.filter((action) => action.enabled).length +
    (state.ai.enabled && !hasAction(state.actions, "action_ai_response") ? 1 : 0) +
    (state.delay.enabled && !hasAction(state.actions, "action_delay") ? 1 : 0)

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/85">Actions</h3>
          <p className="text-xs leading-relaxed text-white/45">
            Toggle the lightweight action set for this automation.
          </p>
        </div>
        <div className="text-xs font-semibold text-white/45">{selectedCount} selected</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ACTION_OPTIONS.map((option) => {
          const isSelected =
            option.type === "action_ai_response"
              ? state.ai.enabled
              : option.type === "action_delay"
                ? state.delay.enabled
                : hasAction(state.actions, option.type)

          return (
            <button
              key={option.type}
              type="button"
              onClick={() =>
                setState((current) => {
                  const nextSelected =
                    option.type === "action_ai_response"
                      ? !current.ai.enabled
                      : option.type === "action_delay"
                        ? !current.delay.enabled
                        : !hasAction(current.actions, option.type)

                  const existingAction = current.actions.find((action) => action.type === option.type)
                  const nextActions = existingAction
                    ? current.actions.map((action) =>
                        action.type === option.type ? { ...action, enabled: nextSelected } : action,
                      )
                    : [...current.actions, defaultActionConfig(option.type)]

                  return {
                    ...current,
                    ai:
                      option.type === "action_ai_response"
                        ? { ...current.ai, enabled: nextSelected }
                        : current.ai,
                    delay:
                      option.type === "action_delay"
                        ? { ...current.delay, enabled: nextSelected }
                        : current.delay,
                    actions: nextActions,
                  }
                })
              }
              className={cn(
                "rounded-lg border p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]",
                isSelected
                  ? "border-violet-400/50 bg-violet-500/15"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white/90">{option.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/45">
                    {option.description}
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    isSelected
                      ? "border-violet-300 bg-violet-400 text-[#080912]"
                      : "border-white/20 text-white/30",
                  )}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/45">
        Detailed settings for messages, conditions, email, and webhooks will be configured in a later
        step. For now, selected actions are stored with starter defaults.
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setState((current) => ({
              ...current,
              ai: { ...current.ai, enabled: false },
              delay: { ...current.delay, enabled: false },
              actions: current.actions.map((action) => ({ ...action, enabled: false })),
            }))
          }
        >
          Clear actions
        </Button>
      </div>
    </div>
  )
}
