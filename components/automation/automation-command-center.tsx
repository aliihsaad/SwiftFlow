"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  ArrowRight,
  Bot,
  CirclePause,
  MessageCircleMore,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react"

import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { cn } from "@/lib/utils"
import type { Automation } from "@/types/automation"

type StatusFilter = "all" | "active" | "paused"

interface AutomationCommandCenterProps {
  automations: Automation[]
  error?: Error
  initialLoading: boolean
  refreshing: boolean
  canWrite: boolean
  togglingAutomationIds: string[]
  deletingAutomationIds: string[]
  onCreateBlank: () => void
  onOpenTemplates: () => void
  onEdit: (automation: Automation) => void
  onToggle: (automationId: string, isActive: boolean) => Promise<void>
  onDelete: (automationId: string) => Promise<void>
  onViewRuns: (automation: Automation) => void
}

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Live" },
  { value: "paused", label: "Paused" },
]

function CommandMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  tone: "cyan" | "violet" | "emerald" | "amber"
}) {
  const tones = {
    cyan: "border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-200",
    violet: "border-violet-400/15 bg-violet-400/[0.06] text-violet-200",
    emerald: "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200",
    amber: "border-amber-400/15 bg-amber-400/[0.06] text-amber-200",
  }

  return (
    <article className={cn("rounded-2xl border p-4", tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </span>
        <span className="grid size-8 place-items-center rounded-xl bg-white/[0.06]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/40">{detail}</p>
    </article>
  )
}

function LoadingLibrary() {
  return (
    <div className="grid gap-3 xl:grid-cols-2" aria-label="Loading automations">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`automation-command-skeleton-${index}`}
          className="h-44 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]"
        />
      ))}
    </div>
  )
}

export function AutomationCommandCenter({
  automations,
  error,
  initialLoading,
  refreshing,
  canWrite,
  togglingAutomationIds,
  deletingAutomationIds,
  onCreateBlank,
  onOpenTemplates,
  onEdit,
  onToggle,
  onDelete,
  onViewRuns,
}: AutomationCommandCenterProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [query, setQuery] = useState("")

  const activeCount = useMemo(
    () => automations.filter((automation) => automation.is_active).length,
    [automations],
  )
  const pausedCount = automations.length - activeCount

  const visibleAutomations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return automations.filter((automation) => {
      if (statusFilter === "active" && !automation.is_active) return false
      if (statusFilter === "paused" && automation.is_active) return false
      if (!normalizedQuery) return true
      return automation.name.toLowerCase().includes(normalizedQuery)
    })
  }, [automations, query, statusFilter])

  return (
    <div className="relative isolate space-y-6 pb-10">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-80 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 12% 35%, rgba(34,211,238,.16), transparent 30%), radial-gradient(circle at 72% 0%, rgba(168,85,247,.18), transparent 32%), radial-gradient(circle at 100% 55%, rgba(244,114,182,.10), transparent 28%)",
        }}
      />

      {!canWrite && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-100">View-only workspace access</p>
            <p className="mt-1 text-xs leading-5 text-white/45">
              You can inspect workflow health and run history. An owner or admin is required to change live automations.
            </p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#12131d]/90 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(330px,.7fr)]">
          <div className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
            <div className="absolute -right-20 -top-20 size-72 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="relative max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/80">
                <Zap className="size-3.5" aria-hidden="true" />
                Automation command center
              </div>
              <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
                Turn every signal into a precise customer journey.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/46 sm:text-base sm:leading-7">
                Design, launch, and observe Instagram engagement from one operational workspace—without losing sight of what is live.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onOpenTemplates}
                  disabled={!canWrite}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#11131d] shadow-[0_10px_35px_rgba(255,255,255,.12)] transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  Start with a playbook
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onCreateBlank}
                  disabled={!canWrite}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Workflow className="size-4 text-cyan-200" aria-hidden="true" />
                  Open blank canvas
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.07] bg-white/[0.018] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Live workspace</p>
                <p className="mt-1 text-sm font-medium text-white/70">Engagement operations</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.85)]" />
                Ready
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <CommandMetric icon={Activity} label="Live" value={String(activeCount)} detail="Active journeys" tone="emerald" />
              <CommandMetric icon={CirclePause} label="Paused" value={String(pausedCount)} detail="Safe to edit" tone="amber" />
              <CommandMetric icon={MessageCircleMore} label="Flows" value={String(automations.length)} detail="Total workflows" tone="cyan" />
              <CommandMetric icon={Bot} label="AI" value="Ready" detail="Response nodes" tone="violet" />
            </div>
          </div>
        </div>
      </section>
        <section className="rounded-[28px] border border-white/[0.08] bg-[#101119]/90 p-4 shadow-[0_22px_70px_rgba(0,0,0,.2)] sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/45">Workflow library</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Journeys in this workspace</h2>
              <p className="mt-1 text-sm text-white/38">Find, inspect, pause, or evolve any customer journey.</p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row">
              <label className="relative min-w-0 lg:w-72">
                <span className="sr-only">Search automations</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search workflows"
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/25 focus:ring-2 focus:ring-cyan-300/10"
                />
              </label>
              <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "h-full rounded-lg px-3 text-xs font-semibold transition",
                      statusFilter === filter.value
                        ? "bg-white/[0.10] text-white shadow-sm"
                        : "text-white/35 hover:text-white/60",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onOpenTemplates}
                disabled={!canWrite}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-300 px-4 text-sm font-semibold text-[#10131c] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="size-4" aria-hidden="true" />
                New journey
              </button>
            </div>
          </div>

          {refreshing && <InlineLoadingHint label="Updating workflow health…" className="mt-5" />}
          <div className="mt-6">
            {initialLoading && <LoadingLibrary />}
            {error && !initialLoading && (
              <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-8 text-center">
                <p className="font-semibold text-rose-200">Workflow library is unavailable</p>
                <p className="mt-2 text-sm text-white/38">{error.message || "Please try again shortly."}</p>
              </div>
            )}
            {!initialLoading && !error && automations.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.018] px-6 py-14 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-200">
                  <Workflow className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">Launch your first customer journey</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/38">Start with a tested playbook, then shape the triggers, decisions, and actions on the visual canvas.</p>
                <button
                  type="button"
                  onClick={onOpenTemplates}
                  disabled={!canWrite}
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#11131c] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  Browse playbooks
                </button>
              </div>
            )}
            {!initialLoading && !error && automations.length > 0 && visibleAutomations.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                <Search className="mx-auto size-5 text-white/30" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-white/65">No journeys match this view</p>
                <button type="button" onClick={() => { setQuery(""); setStatusFilter("all") }} className="mt-2 text-xs font-semibold text-cyan-200 hover:text-cyan-100">Clear filters</button>
              </div>
            )}
            {!initialLoading && !error && visibleAutomations.length > 0 && (
              <ActiveAutomationsList
                automations={visibleAutomations}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
                onViewRuns={onViewRuns}
                togglingAutomationIds={togglingAutomationIds}
                deletingAutomationIds={deletingAutomationIds}
                readOnly={!canWrite}
              />
            )}
          </div>
        </section>
    </div>
  )
}
