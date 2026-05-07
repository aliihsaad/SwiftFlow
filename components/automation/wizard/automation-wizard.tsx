"use client"

import { useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { compileAutomationWizardGraph } from "@/lib/automation-wizard/compiler"
import { summarizeAutomationWizard } from "@/lib/automation-wizard/summary"
import type { AutomationWizardState } from "@/lib/automation-wizard/types"

import { ActionStep } from "./action-step"
import { ReviewStep, type WizardSaveStatus } from "./review-step"
import { SetupStep } from "./setup-step"
import { TriggerStep } from "./trigger-step"
import { WizardStepper } from "./wizard-stepper"

const STEPS = [
  { id: "setup", label: "Setup" },
  { id: "trigger", label: "Trigger" },
  { id: "actions", label: "Actions" },
  { id: "review", label: "Review" },
]

function initialState(): AutomationWizardState {
  return {
    name: "New automation",
    family: "engagement",
    mode: "draft",
    triggerType: "trigger_new_comment",
    account: { socialAccountId: "", platform: "instagram" },
    target: {},
    filters: { triggerType: "any", keywords: [] },
    ai: {
      enabled: false,
      useGlobalSettings: true,
      presetGoal: "auto",
      tone: "friendly",
      length: "short",
      emojiLevel: "light",
      customInstructions: "",
    },
    delay: { enabled: false, durationValue: 5, durationUnit: "minutes" },
    cron: { schedule: "0 9 * * *", timezone: "UTC" },
    actions: [],
  }
}

export function AutomationWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<AutomationWizardState>(() => initialState())
  const [saveStatus, setSaveStatus] = useState<WizardSaveStatus>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useMemo(() => summarizeAutomationWizard(state), [state])
  const currentStep = STEPS[step]
  const isSaveDisabled = saveStatus === "saving" || saveStatus === "saved"

  const updateState: Dispatch<SetStateAction<AutomationWizardState>> = (nextState) => {
    setSaveStatus((current) => (current === "saved" ? "idle" : current))
    setSaveError(null)
    setState(nextState)
  }

  const handleBack = () => {
    if (step === 0) {
      onBack()
      return
    }

    setStep((value) => Math.max(0, value - 1))
  }

  const handleContinue = () => {
    setStep((value) => Math.min(STEPS.length - 1, value + 1))
  }

  const handleSaveDraft = async () => {
    if (isSaveDisabled) {
      return
    }

    setSaveStatus("saving")
    setSaveError(null)

    try {
      const graph = compileAutomationWizardGraph(state)
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          editor_version: "wizard",
          workflow_graph: graph,
          social_account_id: state.account.socialAccountId,
          is_active: false,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save automation draft")
      }

      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("error")
      setSaveError(error instanceof Error ? error.message : "Failed to save automation draft")
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-4xl flex-col gap-4 px-3 sm:px-0">
      <WizardStepper steps={STEPS} currentStep={step} />

      <section className="min-h-[420px] rounded-xl border border-white/10 bg-[#151620] p-4 sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
          {currentStep.label}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white/90">Automation wizard</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/50">{summary}</p>
        {currentStep.id === "setup" ? <SetupStep state={state} setState={updateState} /> : null}
        {currentStep.id === "trigger" ? <TriggerStep state={state} setState={updateState} /> : null}
        {currentStep.id === "actions" ? <ActionStep state={state} setState={updateState} /> : null}
        {currentStep.id === "review" ? (
          <ReviewStep
            state={state}
            saveStatus={saveStatus}
            saveError={saveError}
            onSaveDraft={handleSaveDraft}
            saveDisabled={isSaveDisabled}
          />
        ) : null}
      </section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-[#080912]/95 py-3">
        <Button variant="ghost" onClick={handleBack}>
          {step === 0 ? "Back to automation" : "Back"}
        </Button>
        <Button
          onClick={step === STEPS.length - 1 ? handleSaveDraft : handleContinue}
          disabled={step === STEPS.length - 1 && isSaveDisabled}
        >
          {step === STEPS.length - 1 && saveStatus === "saved" ? "Saved" : step === STEPS.length - 1 ? "Save Draft" : "Continue"}
        </Button>
      </div>
    </div>
  )
}
