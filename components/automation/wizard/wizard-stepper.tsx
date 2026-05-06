"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface WizardStep {
  id: string
  label: string
}

export function WizardStepper({
  steps,
  currentStep,
}: {
  steps: WizardStep[]
  currentStep: number
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const isDone = index < currentStep
        const isActive = index === currentStep

        return (
          <div
            key={step.id}
            className={cn(
              "flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
              isActive
                ? "border-violet-400/45 bg-violet-500/15 text-white"
                : "border-white/10 bg-white/[0.03] text-white/45",
              isDone && "text-white/70",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]",
                isDone && "bg-violet-500/20 text-violet-100",
              )}
            >
              {isDone ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            {step.label}
          </div>
        )
      })}
    </div>
  )
}
