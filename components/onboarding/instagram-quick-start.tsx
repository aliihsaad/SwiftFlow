"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  ArrowRight,
  Check,
  CircleAlert,
  Instagram,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"

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
  instagramConnectionMethod: "instagram_login" | "facebook_login" | null
  instagramWebhookStatus: "active" | "missing" | "error" | "unknown" | null
  instagramAutomationHealth: Health
  accounts: Array<{
    platform: string
    account_name: string
    token_expires_at?: string | null
    metadata?: { account_type?: string | null }
  }>
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
  const response = await fetch(`/api/brand/social-status?workspaceId=${encodeURIComponent(workspaceId)}`, {
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Could not load Instagram connection status")
  return response.json()
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
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load Instagram status")
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success === "instagram_connected") {
      toast.success("Instagram connected")
    } else if (error === "instagram_app_not_configured") {
      toast.error("Add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET to the server environment first.")
    } else if (error) {
      toast.error("Instagram connection did not complete. Review the setup and try again.")
    }
  }, [searchParams])

  const runOperation = async (operation: "verify" | "subscribe" | "refresh") => {
    if (!canManage || busy) return
    setBusy(operation)
    try {
      const response = await fetch(`/api/auth/instagram/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `Instagram ${operation} failed`)
      await loadStatus()
      toast.success(operation === "subscribe"
        ? "Comment webhooks are active"
        : operation === "refresh"
          ? "Instagram token refreshed"
          : "Instagram connection verified")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Instagram setup failed")
    } finally {
      setBusy(null)
    }
  }

  const health = status?.instagramAutomationHealth || EMPTY_HEALTH
  const instagramAccount = status?.accounts.find((account) => account.platform === "instagram")
  const steps = useMemo(() => [
    {
      title: "Professional account",
      description: "Use an Instagram Business or Creator account.",
      complete: health.checks.professionalAccount,
      icon: Instagram,
    },
    {
      title: "Direct Instagram Login",
      description: "No Facebook Page link is required.",
      complete: health.checks.connected && status?.instagramConnectionMethod === "instagram_login",
      icon: ShieldCheck,
    },
    {
      title: "Automation permissions",
      description: "Basic account access and comment management.",
      complete: health.checks.requiredPermissions,
      icon: Workflow,
    },
    {
      title: "Comment webhooks",
      description: "Real comments can enter the automation pipeline.",
      complete: health.checks.commentsWebhook,
      icon: Webhook,
    },
  ], [health, status?.instagramConnectionMethod])
  const completeCount = steps.filter((step) => step.complete).length

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#11131c] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/15 bg-rose-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-100">
              <Sparkles className="h-3.5 w-3.5" />
              Instagram Quick Start
            </div>
            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Connect comments to automations with less setup friction.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Direct Instagram Login connects a professional account to {workspaceName}, checks the token,
              and confirms comment delivery before you activate a workflow.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  window.location.href = `/api/auth/instagram/login?workspaceId=${encodeURIComponent(workspaceId)}`
                }}
                disabled={!canManage}
                className="h-11 gap-2 border border-rose-200/20 bg-linear-to-r from-rose-500/80 to-fuchsia-500/80 px-5 text-white shadow-[0_12px_30px_rgba(225,29,72,0.2)] hover:from-rose-500 hover:to-fuchsia-500"
              >
                <Instagram className="h-4 w-4" />
                {status?.instagram ? "Reconnect Instagram" : "Connect Instagram"}
              </Button>
              {status?.instagram && (
                <Button
                  variant="outline"
                  onClick={() => runOperation("verify")}
                  disabled={!canManage || Boolean(busy)}
                  className="h-11 gap-2 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verify now
                </Button>
              )}
            </div>

            {!canManage && (
              <p className="mt-3 text-sm text-amber-200/80">An owner or admin must complete integration setup.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Readiness</p>
                <p className="mt-1 text-2xl font-semibold text-white">{completeCount} / {steps.length}</p>
              </div>
              <div className={health.ready
                ? "rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200"
                : "rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100"}>
                {health.ready ? "Automation ready" : "Setup in progress"}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-linear-to-r from-rose-400 via-fuchsia-400 to-cyan-300 transition-all"
                style={{ width: `${(completeCount / steps.length) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-white/55">
              {instagramAccount
                ? `${instagramAccount.account_name} · ${instagramAccount.metadata?.account_type || "professional account"}`
                : "No Instagram account connected yet."}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div key={step.title} className="rounded-2xl border border-white/10 bg-[#171923] p-5">
              <div className="flex items-start gap-4">
                <div className={step.complete
                  ? "flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                  : "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/45"}>
                  {step.complete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Step {index + 1}</p>
                  <h2 className="mt-1 font-semibold text-white/90">{step.title}</h2>
                  <p className="mt-1 text-sm text-white/50">{step.description}</p>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {status?.instagram && !health.ready && (
        <section className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] p-5">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div className="flex-1">
              <h2 className="font-semibold text-amber-100">One or more checks need attention</h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/65">
                {health.actions.map((action) => <li key={action}>• {action}</li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {!health.checks.commentsWebhook && (
                  <Button
                    onClick={() => runOperation("subscribe")}
                    disabled={!canManage || Boolean(busy)}
                    className="gap-2 bg-amber-300 text-slate-950 hover:bg-amber-200"
                  >
                    {busy === "subscribe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                    Subscribe comments
                  </Button>
                )}
                {status.tokenHealth === "expiring_soon" && (
                  <Button
                    variant="outline"
                    onClick={() => runOperation("refresh")}
                    disabled={!canManage || Boolean(busy)}
                    className="gap-2 border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh token
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#171923] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-white/90">Next: build the automation</h2>
          <p className="mt-1 text-sm text-white/50">
            Keep provider actions disabled until the readiness badge above is green.
          </p>
        </div>
        <Button asChild disabled={!health.ready} className="gap-2 bg-white text-slate-950 hover:bg-white/90">
          <Link href={health.ready ? "/dashboard/automation" : "#"}>
            Open automation builder
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  )
}
