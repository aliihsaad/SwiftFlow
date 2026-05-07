"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { summarizeAutomationWizard } from "@/lib/automation-wizard/summary"
import type { AutomationWizardState } from "@/lib/automation-wizard/types"

import { ActionStep } from "./action-step"
import { TriggerStep } from "./trigger-step"
import { WizardStepper } from "./wizard-stepper"

const STEPS = [
  { id: "family", label: "Type" },
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
    actions: [],
  }
}

export function AutomationWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<AutomationWizardState>(() => initialState())
  const summary = useMemo(() => summarizeAutomationWizard(state), [state])
  const currentStep = STEPS[step]

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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-4xl flex-col gap-4 px-3 sm:px-0">
      <WizardStepper steps={STEPS} currentStep={step} />

      <section className="min-h-[420px] rounded-xl border border-white/10 bg-[#151620] p-4 sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
          {currentStep.label}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white/90">Automation wizard</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/50">{summary}</p>
        {currentStep.id === "trigger" ? <TriggerStep state={state} setState={setState} /> : null}
        {currentStep.id === "actions" ? <ActionStep state={state} setState={setState} /> : null}
      </section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-[#080912]/95 py-3">
        <Button variant="ghost" onClick={handleBack}>
          {step === 0 ? "Back to automation" : "Back"}
        </Button>
        <Button onClick={handleContinue}>
          {step === STEPS.length - 1 ? "Save Draft" : "Continue"}
        </Button>
      </div>
    </div>
  )
}
