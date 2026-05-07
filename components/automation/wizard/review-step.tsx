"use client"

import { CheckCircle2, Circle, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { compileAutomationWizardGraph } from "@/lib/automation-wizard/compiler"
import { getWizardPermissionRequirements } from "@/lib/automation-wizard/permissions"
import { summarizeAutomationWizard } from "@/lib/automation-wizard/summary"
import type { AutomationWizardState } from "@/lib/automation-wizard/types"

export type WizardSaveStatus = "idle" | "saving" | "saved" | "error"

export function ReviewStep({
  state,
  saveStatus,
  saveError,
  onSaveDraft,
  saveDisabled,
}: {
  state: AutomationWizardState
  saveStatus: WizardSaveStatus
  saveError: string | null
  onSaveDraft: () => void
  saveDisabled: boolean
}) {
  const summary = summarizeAutomationWizard(state)
  const permissions = getWizardPermissionRequirements(state)
  const graph = compileAutomationWizardGraph(state)
  const isSaving = saveStatus === "saving"

  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
          Summary
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/75">{summary}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
            <ShieldCheck className="h-4 w-4 text-violet-200" />
            Required permissions
          </div>
          <div className="mt-3 space-y-3">
            {permissions.length ? (
              permissions.map((requirement) => (
                <div key={`${requirement.platform}:${requirement.permission}`} className="space-y-1">
                  <Badge variant="outline" className="border-white/15 text-white/70">
                    {requirement.permission}
                  </Badge>
                  <p className="text-xs leading-relaxed text-white/45">{requirement.reason}</p>
                </div>
              ))
            ) : (
              <p className="text-xs leading-relaxed text-white/45">
                No additional Meta permissions are required for the current selections.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white/85">Generated graph</div>
          <ol className="mt-3 space-y-2">
            {graph.nodes.map((node, index) => (
              <li key={node.id} className="flex items-center gap-2 text-sm text-white/70">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/55">
                  {index + 1}
                </span>
                <span>{node.data.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
              {saveStatus === "saved" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : (
                <Circle className="h-4 w-4 text-white/35" />
              )}
              Draft status
            </div>
            <p className="text-xs leading-relaxed text-white/45">
              {saveStatus === "saved"
                ? "Draft saved. It is inactive until you enable it later."
                : "Save this automation as an inactive draft before activation controls are added."}
            </p>
            {saveError ? (
              <p className="text-xs font-medium leading-relaxed text-red-300">{saveError}</p>
            ) : null}
          </div>
          <Button type="button" onClick={onSaveDraft} disabled={saveDisabled}>
            {isSaving ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save Draft"}
          </Button>
        </div>
      </div>
    </div>
  )
}
