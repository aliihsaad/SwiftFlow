"use client"

import type { Dispatch, SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type {
  AutomationWizardPlatform,
  AutomationWizardState,
  WizardFilterConfig,
  WizardTriggerType,
} from "@/lib/automation-wizard/types"

const TRIGGER_OPTIONS: Array<{
  type: WizardTriggerType
  label: string
  description: string
}> = [
  {
    type: "trigger_new_comment",
    label: "New comment",
    description: "Start when someone comments on a selected post.",
  },
  {
    type: "trigger_new_message",
    label: "New message",
    description: "Start when someone sends the account a message.",
  },
  {
    type: "trigger_new_follower",
    label: "New follower",
    description: "Start when a person follows the account.",
  },
  {
    type: "trigger_cron",
    label: "Schedule",
    description: "Start from a recurring schedule.",
  },
  {
    type: "trigger_story_mention",
    label: "Story mention",
    description: "Start when the account is mentioned in a story.",
  },
  {
    type: "trigger_story_reply",
    label: "Story reply",
    description: "Start when someone replies to a story.",
  },
]

const PLATFORM_OPTIONS: Array<{ platform: AutomationWizardPlatform; label: string }> = [
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
]

const FILTER_OPTIONS: Array<{ type: WizardFilterConfig["triggerType"]; label: string }> = [
  { type: "any", label: "Any" },
  { type: "keywords", label: "Keywords" },
]

function parseKeywords(value: string): string[] {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

export function TriggerStep({
  state,
  setState,
}: {
  state: AutomationWizardState
  setState: Dispatch<SetStateAction<AutomationWizardState>>
}) {
  return (
    <div className="mt-5 space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">Trigger</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRIGGER_OPTIONS.map((option) => {
            const isSelected = state.triggerType === option.type

            return (
              <button
                key={option.type}
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    triggerType: option.type,
                  }))
                }
                className={cn(
                  "rounded-lg border p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]",
                  isSelected
                    ? "border-violet-400/50 bg-violet-500/15"
                    : "border-white/10 bg-white/[0.03]",
                )}
              >
                <div className="text-sm font-semibold text-white/90">{option.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/45">{option.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">Platform</Label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_OPTIONS.map((option) => (
            <Button
              key={option.platform}
              type="button"
              variant={state.account.platform === option.platform ? "default" : "outline"}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  account: {
                    ...current.account,
                    platform: option.platform,
                  },
                }))
              }
              className="w-full"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">Filter</Label>
        <div className="grid grid-cols-2 gap-2">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.type}
              type="button"
              variant={state.filters.triggerType === option.type ? "default" : "outline"}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    triggerType: option.type,
                    keywords: option.type === "keywords" ? current.filters.keywords : [],
                  },
                }))
              }
              className="w-full"
            >
              {option.label}
            </Button>
          ))}
        </div>

        {state.filters.triggerType === "keywords" ? (
          <div className="space-y-2">
            <Label htmlFor="wizard-trigger-keywords" className="text-xs text-white/55">
              Keywords
            </Label>
            <Input
              id="wizard-trigger-keywords"
              value={state.filters.keywords.join(", ")}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    keywords: parseKeywords(event.target.value),
                  },
                }))
              }
              placeholder="pricing, demo, support"
              className="bg-white/[0.04] text-white placeholder:text-white/30"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
