"use client"

import type { Dispatch, SetStateAction } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AutomationWizardState } from "@/lib/automation-wizard/types"

export function SetupStep({
  state,
  setState,
}: {
  state: AutomationWizardState
  setState: Dispatch<SetStateAction<AutomationWizardState>>
}) {
  return (
    <div className="mt-5 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="wizard-automation-name" className="text-sm font-semibold text-white/80">
          Automation name
        </Label>
        <Input
          id="wizard-automation-name"
          value={state.name}
          onChange={(event) =>
            setState((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="e.g. Comment auto-DM"
          className="bg-white/[0.04] text-white placeholder:text-white/30"
        />
        <p className="text-xs leading-relaxed text-white/45">
          Used in lists and logs. You can rename it later.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
          Automation kind
        </div>
        <div className="mt-1 text-sm font-semibold text-white/85">Engagement automation</div>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Engagement automations react to comments, messages, follows, mentions, or schedules.
          Publishing automations are managed in their own builder.
        </p>
      </div>
    </div>
  )
}
