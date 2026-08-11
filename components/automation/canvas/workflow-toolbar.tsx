"use client"

import {
  Check,
  LayoutDashboard,
  Loader2,
  Power,
  PowerOff,
  Redo,
  Save,
  Undo,
  Workflow,
  X,
} from "lucide-react"

interface WorkflowToolbarProps {
  automationName: string
  isActive: boolean
  isSaving: boolean
  canUndo: boolean
  canRedo: boolean
  onBack: () => void
  onSave: () => void
  onToggleActive: () => void
  onUndo: () => void
  onRedo: () => void
  onAutoLayout: () => void
  onNameChange: (name: string) => void
}

export function WorkflowToolbar({
  automationName,
  isActive,
  isSaving,
  canUndo,
  canRedo,
  onBack,
  onSave,
  onToggleActive,
  onUndo,
  onRedo,
  onAutoLayout,
  onNameChange,
}: WorkflowToolbarProps) {
  return (
    <header className="relative z-30 shrink-0 border-b border-white/[0.07] bg-[#10121a]/95 px-3 py-3 backdrop-blur-xl sm:px-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/28">
            <Workflow className="size-3 text-cyan-200/55" aria-hidden="true" />
            Journey builder
          </div>
          <input
            type="text"
            value={automationName}
            onChange={(event) => onNameChange(event.target.value)}
            className="mt-0.5 w-full max-w-md bg-transparent text-base font-semibold text-white/90 outline-none placeholder:text-white/25"
            placeholder="Name this journey"
            aria-label="Automation name"
          />
        </div>

        <div className="order-3 flex w-full items-center justify-between gap-2 border-t border-white/[0.06] pt-3 lg:order-none lg:w-auto lg:border-0 lg:pt-0">
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
            <ToolbarIconButton label="Undo" onClick={onUndo} disabled={!canUndo}>
              <Undo className="size-4" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton label="Redo" onClick={onRedo} disabled={!canRedo}>
              <Redo className="size-4" aria-hidden="true" />
            </ToolbarIconButton>
            <span className="mx-1 h-5 w-px bg-white/[0.07]" />
            <button
              type="button"
              onClick={onAutoLayout}
              className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white/75"
            >
              <LayoutDashboard className="size-3.5 text-violet-200/70" aria-hidden="true" />
              <span className="hidden sm:inline">Arrange</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleActive}
              className={
                "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition "
                + (isActive
                  ? "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200 hover:bg-emerald-300/[0.11]"
                  : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-white/[0.06]")
              }
            >
              {isActive
                ? <Power className="size-3.5" aria-hidden="true" />
                : <PowerOff className="size-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">{isActive ? "Live" : "Paused"}</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-xs font-semibold text-white/60 transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/85 disabled:cursor-wait disabled:opacity-50 sm:px-4"
            >
              <X className="size-3.5" aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-300 px-4 text-xs font-bold text-[#10131c] shadow-[0_8px_26px_rgba(103,232,249,.12)] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-65"
            >
              {isSaving
                ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                : <Save className="size-3.5" aria-hidden="true" />}
              {isSaving ? "Saving" : "Save journey"}
            </button>
          </div>
        </div>

        <div className="hidden items-center gap-2 border-l border-white/[0.07] pl-3 xl:flex">
          <span className="grid size-7 place-items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">Status</span>
            <span className="block text-[11px] text-white/55">Ready to validate</span>
          </span>
        </div>
      </div>
    </header>
  )
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-20"
    >
      {children}
    </button>
  )
}
