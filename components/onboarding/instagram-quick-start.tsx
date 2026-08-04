"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
    ArrowRight,
    Bot,
    Check,
    CircleAlert,
    Instagram,
    KeyRound,
    Loader2,
    RefreshCw,
    Rocket,
    ShieldCheck,
    Sparkles,
    Webhook,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { getInstagramConnectionNotice } from "@/lib/instagram-onboarding-diagnostics"

type Health = {
    status: "not_connected" | "action_required" | "ready"
    ready: boolean
    checks: {
        connected: boolean
        professionalAccount: boolean
        requiredPermissions: boolean
        tokenValid: boolean
        commentsWebhook: boolean
    }
    missingScopes: string[]
    actions: string[]
}

type SocialStatus = {
    instagram: boolean
    tokenHealth: "valid" | "expiring_soon" | "invalid" | null
    instagramConnectionMethod: "instagram_login" | null
    instagramWebhookStatus: "active" | "missing" | "error" | "unknown" | null
    instagramAutomationHealth: Health
    accounts: Array<{
        platform: string
        account_name: string
        metadata?: { account_type?: string | null }
    }>
}

type SetupStep = {
    id: number
    title: string
    label: string
    description: string
    complete: boolean
    icon: typeof Instagram
    checks: string[]
}

const EMPTY_HEALTH: Health = {
    status: "not_connected",
    ready: false,
    checks: {
        connected: false,
        professionalAccount: false,
        requiredPermissions: false,
        tokenValid: false,
        commentsWebhook: false,
    },
    missingScopes: [],
    actions: [],
}

async function requestInstagramStatus(workspaceId: string): Promise<SocialStatus> {
    const response = await fetch(
        "/api/brand/social-status?workspaceId=" + encodeURIComponent(workspaceId),
        { cache: "no-store" },
    )
    if (!response.ok) throw new Error("Could not load Instagram connection status")
    return response.json()
}

function StepNavigation({
    step,
    active,
    onSelect,
}: {
    step: SetupStep
    active: boolean
    onSelect: () => void
}) {
    const Icon = step.icon
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={active ? "step" : undefined}
            className={
                active
                    ? "flex w-full items-center gap-3 rounded-2xl border border-violet-300/20 bg-violet-400/[0.1] p-3.5 text-left"
                    : "flex w-full items-center gap-3 rounded-2xl border border-transparent p-3.5 text-left transition hover:border-white/[0.07] hover:bg-white/[0.035]"
            }
        >
            <span
                className={
                    step.complete
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                        : active
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/35"
                }
            >
                {step.complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-white/28">
                    Step {step.id}
                </span>
                <span className={active ? "mt-1 block truncate text-sm font-semibold text-white" : "mt-1 block truncate text-sm font-semibold text-white/62"}>
                    {step.label}
                </span>
            </span>
        </button>
    )
}

export function InstagramQuickStart({
    workspaceId,
    workspaceName,
}: {
    workspaceId: string
    workspaceName: string
}) {
    const searchParams = useSearchParams()
    const canManage = useWorkspacePermission("integrations:write")
    const [status, setStatus] = useState<SocialStatus | null>(null)
    const [busy, setBusy] = useState<"verify" | "subscribe" | "refresh" | null>(null)
    const [selectedStepId, setSelectedStepId] = useState<number | null>(null)
    const connectionNotice = useMemo(
        () => getInstagramConnectionNotice(searchParams),
        [searchParams],
    )

    const loadStatus = useCallback(async () => {
        setStatus(await requestInstagramStatus(workspaceId))
    }, [workspaceId])

    useEffect(() => {
        let cancelled = false
        void requestInstagramStatus(workspaceId)
            .then((nextStatus) => {
                if (!cancelled) setStatus(nextStatus)
            })
            .catch((error) => {
                if (!cancelled) {
                    toast.error(error instanceof Error ? error.message : "Could not load Instagram status")
                }
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId])

    useEffect(() => {
        if (!connectionNotice) return
        if (connectionNotice.tone === "success") toast.success(connectionNotice.title)
        else toast.error(connectionNotice.title)
    }, [connectionNotice])

    const health = status?.instagramAutomationHealth || EMPTY_HEALTH
    const account = status?.accounts.find((item) => item.platform === "instagram")
    const steps = useMemo<SetupStep[]>(
        () => [
            {
                id: 1,
                label: "Connect account",
                title: "Connect a professional Instagram account",
                description: "Authorize a Business or Creator account through direct Instagram Login.",
                complete: health.checks.connected && health.checks.professionalAccount,
                icon: Instagram,
                checks: ["Direct Instagram Login", "Encrypted long-lived token", "Business or Creator account"],
            },
            {
                id: 2,
                label: "Verify access",
                title: "Verify permissions and token health",
                description: "Confirm the profile, required permissions, and saved token before receiving events.",
                complete: health.checks.requiredPermissions && health.checks.tokenValid,
                icon: ShieldCheck,
                checks: ["Professional account identity", "Comment management permission", "Healthy access token"],
            },
            {
                id: 3,
                label: "Enable webhooks",
                title: "Activate comment webhooks",
                description: "Subscribe the account and confirm that real comments can reach the automation pipeline.",
                complete: health.checks.commentsWebhook,
                icon: Webhook,
                checks: ["Signed event delivery", "Immediate subscription read-back", "Durable event processing"],
            },
            {
                id: 4,
                label: "Finish setup",
                title: "Launch your first automation",
                description: "Review readiness, configure optional AI capabilities, and build your first workflow.",
                complete: health.ready,
                icon: Rocket,
                checks: ["Account verified", "Webhook active", "Automation builder unlocked"],
            },
        ],
        [health],
    )
    const activeStepId = selectedStepId ?? steps.find((step) => !step.complete)?.id ?? 4
    const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0]
    const completeCount = steps.filter((step) => step.complete).length
    const progress = Math.round((completeCount / steps.length) * 100)
    const ActiveIcon = activeStep.icon

    const runOperation = async (operation: "verify" | "subscribe" | "refresh") => {
        if (!canManage || busy) return
        setBusy(operation)
        try {
            const response = await fetch("/api/auth/instagram/" + operation, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || "Instagram setup failed")
            await loadStatus()
            setSelectedStepId(null)
            toast.success(
                operation === "subscribe"
                    ? "Comment webhooks are active"
                    : operation === "refresh"
                      ? "Instagram token refreshed"
                      : "Instagram connection verified",
            )
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Instagram setup failed")
        } finally {
            setBusy(null)
        }
    }

    const connectInstagram = () => {
        window.location.href =
            "/api/auth/instagram/login?workspaceId=" + encodeURIComponent(workspaceId)
    }

    return (
        <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-8">
            <section className="sf-panel relative overflow-hidden p-5 sm:p-7">
                <div className="pointer-events-none absolute -right-24 -top-36 h-80 w-80 rounded-full bg-violet-500/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-36 left-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="sf-kicker">
                            <Sparkles className="h-3.5 w-3.5" />
                            Guided setup
                        </div>
                        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">
                            Get automation-ready without the guesswork.
                        </h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52 sm:text-base">
                            Connect Instagram, verify the exact capabilities SwiftFlow needs, and
                            confirm live webhook delivery for {workspaceName}.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {["Workspace ready", "Direct Instagram Login", "About 3 minutes"].map((item) => (
                                <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-white/48">
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="min-w-full rounded-2xl border border-white/[0.08] bg-black/15 p-4 backdrop-blur-xl sm:min-w-[300px] xl:max-w-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/32">Setup progress</p>
                                <p className="mt-1.5 text-2xl font-semibold text-white">{completeCount} of {steps.length}</p>
                            </div>
                            <span className={health.ready ? "rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200" : "rounded-full border border-amber-300/15 bg-amber-400/[0.08] px-3 py-1 text-[11px] font-semibold text-amber-100/80"}>
                                {health.ready ? "Automation ready" : "In progress"}
                            </span>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                            <div className="h-full rounded-full bg-linear-to-r from-violet-400 via-fuchsia-400 to-cyan-300 transition-[width]" style={{ width: String(progress) + "%" }} />
                        </div>
                        <p className="mt-3 truncate text-xs text-white/42">
                            {account ? "@" + account.account_name + " · " + (account.metadata?.account_type || "professional") : "No Instagram account connected yet"}
                        </p>
                    </div>
                </div>
            </section>

            {connectionNotice ? (
                <section aria-live="polite" className={connectionNotice.tone === "success" ? "rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4" : "rounded-2xl border border-rose-300/15 bg-rose-400/[0.06] p-4"}>
                    <div className="flex gap-3">
                        {connectionNotice.tone === "success" ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />}
                        <div>
                            <h3 className="text-sm font-semibold text-white">{connectionNotice.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-white/55">{connectionNotice.message}</p>
                             {connectionNotice.reference ? <p className="mt-2 font-mono text-[11px] text-white/30">Technical reference: {connectionNotice.reference}</p> : null}
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="grid gap-5 lg:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)]">
                <aside className="sf-panel h-fit p-3">
                    <div className="px-3 pb-3 pt-2">
                        <p className="text-xs font-semibold text-white/72">Setup checklist</p>
                        <p className="mt-1 text-xs leading-5 text-white/35">Progress updates after each verification.</p>
                    </div>
                    <div className="space-y-1.5">
                        {steps.map((step) => (
                            <StepNavigation key={step.id} step={step} active={step.id === activeStepId} onSelect={() => setSelectedStepId(step.id)} />
                        ))}
                    </div>
                </aside>

                <div className="sf-panel min-h-[470px] overflow-hidden">
                    <div className="border-b border-white/[0.07] px-5 py-5 sm:px-7">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-100/65">Step {activeStep.id} of {steps.length}</p>
                                <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-white sm:text-2xl">{activeStep.title}</h3>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{activeStep.description}</p>
                            </div>
                            <span className={activeStep.complete ? "inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-200" : "inline-flex w-fit items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-white/45"}>
                                {activeStep.complete ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
                                {activeStep.complete ? "Complete" : "Action needed"}
                            </span>
                        </div>
                    </div>

                    <div className="p-5 sm:p-7">
                        {status === null ? (
                            <div className="flex min-h-64 items-center justify-center text-center">
                                <div>
                                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-200" />
                                    <p className="mt-3 text-sm text-white/45">Checking workspace readiness…</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
                                <div className="sf-subtle-panel p-5 sm:p-6">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-200/15 bg-linear-to-br from-violet-400/15 to-cyan-300/10 text-white">
                                        <ActiveIcon className="h-6 w-6" />
                                    </span>
                                    <h4 className="mt-5 text-lg font-semibold text-white">{activeStep.label}</h4>
                                    <p className="mt-2 text-sm leading-6 text-white/48">{activeStep.description}</p>

                                    {activeStepId === 1 ? (
                                        <Button onClick={connectInstagram} disabled={!canManage} className="mt-6 h-11 gap-2 border border-rose-200/20 bg-linear-to-r from-rose-500 to-fuchsia-500 px-5 text-white hover:brightness-110">
                                            <Instagram className="h-4 w-4" />
                                            {status.instagram ? "Reconnect Instagram" : "Connect Instagram"}
                                        </Button>
                                    ) : null}

                                    {activeStepId === 2 ? (
                                        <div className="mt-6 flex flex-wrap gap-2">
                                            <Button onClick={() => runOperation("verify")} disabled={!canManage || Boolean(busy) || !status.instagram} className="h-11 gap-2 bg-white text-slate-950 hover:bg-white/90">
                                                {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                                Verify connection
                                            </Button>
                                            {status.tokenHealth === "expiring_soon" ? (
                                                <Button variant="outline" onClick={() => runOperation("refresh")} disabled={!canManage || Boolean(busy)} className="h-11 gap-2 border-white/10 bg-white/[0.035] text-white hover:bg-white/[0.07]">
                                                    {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                                    Refresh token
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {activeStepId === 3 ? (
                                        <Button onClick={() => runOperation("subscribe")} disabled={!canManage || Boolean(busy) || !health.checks.requiredPermissions} className="mt-6 h-11 gap-2 bg-violet-500 px-5 text-white hover:bg-violet-400">
                                            {busy === "subscribe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                                            Activate comment webhooks
                                        </Button>
                                    ) : null}

                                    {activeStepId === 4 ? (
                                        <div className="mt-6 flex flex-wrap gap-2">
                                            {health.ready ? (
                                                <Button asChild className="h-11 gap-2 bg-white text-slate-950 hover:bg-white/90">
                                                    <Link href="/dashboard/automation">Open automation builder <ArrowRight className="h-4 w-4" /></Link>
                                                </Button>
                                            ) : (
                                                <Button disabled className="h-11 gap-2">Open automation builder <ArrowRight className="h-4 w-4" /></Button>
                                            )}
                                            <Button asChild variant="outline" className="h-11 gap-2 border-white/10 bg-white/[0.035] text-white hover:bg-white/[0.07]">
                                                <Link href="/dashboard/settings"><Bot className="h-4 w-4" /> Configure AI <span className="text-white/35">(optional)</span></Link>
                                            </Button>
                                        </div>
                                    ) : null}

                                    {!canManage ? <p className="mt-4 text-xs text-amber-100/70">An owner or admin must complete integration setup.</p> : null}
                                </div>

                                <div className="space-y-3">
                                    {activeStep.checks.map((item, index) => (
                                        <div key={item} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                                            <span className={activeStep.complete ? "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200" : "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.05] text-white/32"}>
                                                {activeStep.complete ? <Check className="h-3 w-3" /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                                            </span>
                                            <span className="text-sm leading-5 text-white/58">{item}</span>
                                        </div>
                                    ))}
                                    {activeStepId === 2 ? (
                                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Token health</p>
                                            <p className="mt-2 text-sm font-semibold text-white/75">{status.tokenHealth === "valid" ? "Healthy" : status.tokenHealth === "expiring_soon" ? "Expiring soon" : status.tokenHealth === "invalid" ? "Reconnect required" : "Not verified"}</p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        {status?.instagram && !health.ready && health.actions.length > 0 ? (
                            <div className="mt-6 rounded-xl border border-amber-300/12 bg-amber-400/[0.045] p-4">
                                <div className="flex gap-3">
                                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-100/90">Setup guidance</p>
                                        <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/55">
                                            {health.actions.map((action) => <li key={action}>• {action}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4 sm:px-7">
                        <Button type="button" variant="ghost" disabled={activeStepId === 1} onClick={() => setSelectedStepId(Math.max(1, activeStepId - 1))} className="text-white/48 hover:bg-white/[0.05] hover:text-white">
                            Back
                        </Button>
                        <Button type="button" variant="outline" disabled={activeStepId === steps.length} onClick={() => setSelectedStepId(Math.min(steps.length, activeStepId + 1))} className="gap-2 border-white/10 bg-white/[0.035] text-white hover:bg-white/[0.07]">
                            Review next step <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    )
}
