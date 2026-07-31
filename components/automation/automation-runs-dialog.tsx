"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import type { Automation } from "@/types/automation"

interface AutomationRun {
  id: string
  status: string
  trigger_type: string | null
  processed_count: number
  dms_sent_count: number
  error_count: number
  error_message: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

interface TimelineEvent {
  id: string
  event_key: string
  run_id: string | null
  scheduled_execution_id: string | null
  action_outbox_id: string | null
  provider_event_key: string | null
  source: "graph" | "provider_action"
  event_type: string
  node_id: string
  node_type: string
  attempt_number: number
  replay_number: number
  input_redacted: Record<string, unknown>
  output_redacted: Record<string, unknown>
  error_code: string | null
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

interface ProviderAction {
  id: string
  provider_event_key: string
  node_id: string
  action_type: string
  status: string
  attempt_count: number
  max_attempts: number
  last_error_code: string | null
  last_error_message: string | null
  suppressed_reason: string | null
  outcome_ambiguous: boolean
  replay_count: number
  can_replay: boolean
  replay_block_reason: string
  updated_at: string
}

interface RunsResponse {
  runs: AutomationRun[]
  events: TimelineEvent[]
  actions: ProviderAction[]
}

interface AutomationRunsDialogProps {
  automation: Automation | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canReplay: boolean
}

const PANEL = "#151620"
const PANEL_ALT = "#1b1d28"
const BORDER = "rgba(255,255,255,0.08)"
const MUTED = "rgba(255,255,255,0.42)"

async function fetcher(url: string): Promise<RunsResponse> {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Failed to load run history")
  return body
}

function shortId(value: string | null | undefined): string {
  if (!value) return "—"
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not recorded"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function statusTone(status: string) {
  if (["succeeded", "completed"].includes(status)) {
    return { color: "#34d399", background: "rgba(52,211,153,0.10)", icon: CheckCircle2 }
  }
  if (["failed", "dead_lettered"].includes(status)) {
    return { color: "#fb7185", background: "rgba(251,113,133,0.10)", icon: XCircle }
  }
  if (["retry_scheduled", "replay_requested", "started", "claimed", "pending", "waiting"].includes(status)) {
    return { color: "#fbbf24", background: "rgba(251,191,36,0.10)", icon: Clock3 }
  }
  if (status === "suppressed") {
    return { color: "#c4b5fd", background: "rgba(196,181,253,0.10)", icon: ShieldCheck }
  }
  return { color: "#94a3b8", background: "rgba(148,163,184,0.10)", icon: Activity }
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status)
  const Icon = tone.icon
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: tone.color, background: tone.background }}
    >
      <Icon className="h-3 w-3" />
      {status.replaceAll("_", " ")}
    </span>
  )
}

function JsonDisclosure({ label, value }: { label: string; value: Record<string, unknown> }) {
  if (!value || Object.keys(value).length === 0) return null
  return (
    <details className="group rounded-lg" style={{ background: "rgba(255,255,255,0.025)" }}>
      <summary
        className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold"
        style={{ color: MUTED }}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <pre
        className="max-h-52 overflow-auto border-t px-3 py-2 text-[10px] leading-relaxed"
        style={{ borderColor: BORDER, color: "rgba(255,255,255,0.58)" }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  )
}

export function AutomationRunsDialog({
  automation,
  open,
  onOpenChange,
  canReplay,
}: AutomationRunsDialogProps) {
  const { toast } = useToast()
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [pendingReplay, setPendingReplay] = useState<ProviderAction | null>(null)
  const endpoint = open && automation
    ? `/api/automations/${automation.id}/runs?limit=20`
    : null
  const { data, error, isLoading, isValidating, mutate } = useSWR<RunsResponse>(
    endpoint,
    fetcher,
    { revalidateOnFocus: false },
  )

  const requestReplay = async (action: ProviderAction) => {
    if (!automation || !canReplay || !action.can_replay) return
    setReplayingId(action.id)
    try {
      const response = await fetch(
        `/api/automations/${automation.id}/actions/${action.id}/replay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Operator requested replay from run history" }),
        },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Replay request failed")
      toast({
        title: "Action queued for replay",
        description: "It will pass through every safety gate again before any provider call.",
      })
      await mutate()
    } catch (replayError) {
      toast({
        title: "Replay blocked",
        description: replayError instanceof Error ? replayError.message : "Replay request failed",
        variant: "destructive",
      })
    } finally {
      setReplayingId(null)
      setPendingReplay(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(94dvh,920px)] w-[calc(100vw-1rem)] max-w-6xl overflow-hidden rounded-[26px] border-white/[0.08] bg-[#10121a] p-0 shadow-[0_30px_100px_rgba(0,0,0,.5)] sm:w-full">
        <DialogHeader className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_15%_0%,rgba(103,232,249,.10),transparent_34%),#12141e] px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4 pr-7">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
                <History className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-100/40">Operations timeline</p>
                <DialogTitle className="mt-1 truncate text-lg font-semibold tracking-tight text-white/92">
                  {automation?.name || "Automation"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-white/35">
                  Immutable, redacted journey and provider events
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => mutate()}
              disabled={isValidating}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.07] hover:text-white/75 disabled:opacity-45"
            >
              <RefreshCw className={"size-3.5 " + (isValidating ? "animate-spin" : "")} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </DialogHeader>

        <div className="h-[calc(min(94dvh,920px)-102px)] space-y-6 overflow-y-auto bg-[#0e1018] px-4 py-5 sm:px-7">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading execution history…
            </div>
          )}

          {error && !isLoading && (
            <div
              className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: "rgba(251,113,133,0.07)", border: "1px solid rgba(251,113,133,0.18)" }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#fb7185" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#fb7185" }}>History unavailable</p>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>{error.message}</p>
              </div>
            </div>
          )}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100/35">Recent runs</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{data.runs.length}</p>
                  <p className="mt-1 text-[11px] text-white/30">Recorded executions</p>
                </div>
                <div className="rounded-2xl border border-violet-300/10 bg-violet-300/[0.035] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-100/35">Node events</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{data.events.length}</p>
                  <p className="mt-1 text-[11px] text-white/30">Timeline checkpoints</p>
                </div>
                <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.035] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100/35">Provider actions</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{data.actions.length}</p>
                  <p className="mt-1 text-[11px] text-white/30">External outcomes</p>
                </div>
                <div className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.035] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-100/35">Needs attention</p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {data.runs.filter((run) => run.error_count > 0).length + data.actions.filter((action) => ["failed", "dead_lettered"].includes(action.status)).length}
                  </p>
                  <p className="mt-1 text-[11px] text-white/30">Failures and dead letters</p>
                </div>
              </div>
              <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.018] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Provider actions
                    </h3>
                    <p className="mt-1 text-xs" style={{ color: MUTED }}>
                      Manual replay is offered only when the previous outcome is known not to be ambiguous.
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: MUTED }}>{data.actions.length} recorded</span>
                </div>

                {data.actions.length === 0 ? (
                  <div className="rounded-xl px-4 py-5 text-sm" style={{ background: PANEL_ALT, color: MUTED }}>
                    No provider actions have been recorded for this automation.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {data.actions.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-xl p-4"
                        style={{ background: PANEL_ALT, border: `1px solid ${BORDER}` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                              {action.action_type.replaceAll("_", " ")}
                            </p>
                            <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
                              Node {shortId(action.node_id)} · attempt {action.attempt_count}/{action.max_attempts}
                              {action.replay_count > 0 ? ` · ${action.replay_count} replay(s)` : ""}
                            </p>
                          </div>
                          <StatusBadge status={action.status} />
                        </div>

                        {(action.last_error_message || action.suppressed_reason) && (
                          <p
                            className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
                            style={{ background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.52)" }}
                          >
                            {action.last_error_message || action.suppressed_reason}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[10px]" style={{ color: MUTED }}>
                            Updated {formatTimestamp(action.updated_at)}
                          </span>
                          {canReplay && action.can_replay && (
                            <button
                              type="button"
                              onClick={() => setPendingReplay(action)}
                              disabled={Boolean(replayingId)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                              style={{ background: "rgba(56,189,248,0.10)", color: "#67e8f9", border: "1px solid rgba(56,189,248,0.18)" }}
                            >
                              {replayingId === action.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RotateCcw className="h-3.5 w-3.5" />}
                              Replay
                            </button>
                          )}
                          {!action.can_replay && action.outcome_ambiguous && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#fbbf24" }}>
                              <ShieldCheck className="h-3 w-3" />
                              Replay safety lock
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.018] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Recent runs
                  </h3>
                  <span className="text-xs" style={{ color: MUTED }}>{data.runs.length} shown</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {data.runs.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-xl p-3"
                      style={{ background: PANEL_ALT, border: `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
                          Run {shortId(run.id)}
                        </span>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="mt-2 text-[10px]" style={{ color: MUTED }}>{formatTimestamp(run.created_at)}</p>
                      <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
                        {run.processed_count} processed · {run.error_count} error(s) · {run.dms_sent_count} DM(s)
                      </p>
                    </div>
                  ))}
                  {data.runs.length === 0 && (
                    <div className="rounded-xl px-4 py-5 text-sm md:col-span-2 xl:col-span-3" style={{ background: PANEL_ALT, color: MUTED }}>
                      No graph runs have been recorded yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.018] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Node timeline
                    </h3>
                    <p className="mt-1 text-xs" style={{ color: MUTED }}>
                      Values below were redacted and bounded before they entered the audit ledger.
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: MUTED }}>{data.events.length} events</span>
                </div>

                <div className="space-y-2">
                  {data.events.map((event) => (
                    <div
                      key={event.event_key}
                      className="rounded-xl p-4"
                      style={{ background: PANEL_ALT, border: `1px solid ${BORDER}` }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                              {event.node_type.replaceAll("_", " ")}
                            </p>
                            <StatusBadge status={event.event_type} />
                          </div>
                          <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
                            Node {shortId(event.node_id)} · attempt {event.attempt_number}
                            {event.replay_number > 0 ? ` · replay ${event.replay_number}` : ""}
                            {event.run_id ? ` · run ${shortId(event.run_id)}` : ""}
                          </p>
                        </div>
                        <div className="text-right text-[10px]" style={{ color: MUTED }}>
                          <p>{formatTimestamp(event.created_at)}</p>
                          {event.duration_ms != null && <p className="mt-1">{event.duration_ms} ms</p>}
                        </div>
                      </div>

                      {event.error_message && (
                        <p
                          className="mt-3 rounded-lg px-3 py-2 text-xs"
                          style={{ background: "rgba(251,113,133,0.06)", color: "#fda4af" }}
                        >
                          {event.error_code ? `${event.error_code}: ` : ""}{event.error_message}
                        </p>
                      )}
                      <div className="mt-3 grid gap-2 lg:grid-cols-2">
                        <JsonDisclosure label="Redacted input" value={event.input_redacted} />
                        <JsonDisclosure label="Redacted output" value={event.output_redacted} />
                      </div>
                    </div>
                  ))}
                  {data.events.length === 0 && (
                    <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ background: PANEL_ALT, color: MUTED }}>
                      The timeline is ready. New executions will appear here as nodes start and finish.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>

      <AlertDialog
        open={Boolean(pendingReplay)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !replayingId) setPendingReplay(null)
        }}
      >
        <AlertDialogContent
          style={{ background: PANEL, border: `1px solid ${BORDER}` }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "rgba(255,255,255,0.9)" }}>
              Replay this provider action?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new execution attempt. It is available only because the
              previous result is known not to be ambiguous, and all safety gates will
              run again before any provider request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(replayingId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingReplay || Boolean(replayingId)}
              onClick={(event) => {
                event.preventDefault()
                if (pendingReplay) void requestReplay(pendingReplay)
              }}
            >
              {replayingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Queue replay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
