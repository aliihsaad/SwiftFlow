"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import {
    ArrowRight,
    BadgeCheck,
    Bot,
    CalendarClock,
    CreditCard,
    Gauge,
    Loader2,
    ShieldAlert,
    Sparkles,
    Zap,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

type BillingSummary = {
    billingAvailable: boolean
    byokAi: boolean
    canManageBilling: boolean
    plan: {
        tier: "free" | "pro" | "agency"
        source: string
        status: string
        cancelAtPeriodEnd: boolean
        currentPeriodEnd: string | null
        trialEnd: string | null
        downgradeGraceUntil: string | null
        hasSubscription: boolean
        canStartCheckout: boolean
    }
    limits: {
        maxWorkspaces: number
        maxTeamSeats: number
        maxSocialAccounts: number
        aiGenerationsPerMonth: number
        scheduledPostsPerMonth: number
        maxActiveAutomations: number
        mediaQuotaBytes: number
        generatedAssetQuotaBytes: number
        developerApiEnabled: boolean
        deepTrendReportsEnabled: boolean
    }
    usage: {
        aiGenerations: number
        scheduledPosts: number
        mediaUploadBytes: number
        generatedAssetBytes: number
    }
}

const PLAN_CARDS = [
    {
        tier: "free" as const,
        name: "Free",
        icon: Bot,
        accent: "rgba(255,255,255,0.5)",
        monthly: 0,
        yearly: 0,
        blurb: "Get started with core publishing",
        features: [
            "1 workspace",
            "Instagram + Facebook connection",
            "Post creation and scheduling",
            "BYOK AI workflows (your provider key)",
            "1 team seat, 1 automation",
        ],
    },
    {
        tier: "pro" as const,
        name: "Pro",
        icon: Zap,
        accent: "#22d3ee",
        monthly: 29,
        yearly: 290,
        blurb: "For growing brands and creators",
        features: [
            "3 workspaces",
            "5 team seats, 10 automations",
            "500 scheduled posts / month",
            "Developer API access",
            "Deep trend reports",
            "10 GB media storage",
        ],
    },
    {
        tier: "agency" as const,
        name: "Agency",
        icon: Sparkles,
        accent: "#e879f9",
        monthly: 99,
        yearly: 990,
        blurb: "For teams managing many clients",
        features: [
            "10 workspaces",
            "20 team seats, 50 automations",
            "5,000 scheduled posts / month",
            "Developer API access",
            "Deep trend reports",
            "100 GB media storage",
        ],
    },
]

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load billing summary")
    return res.json()
})

function formatDate(value: string | null): string {
    if (!value) return ""
    const date = new Date(value)
    return Number.isFinite(date.getTime())
        ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : ""
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
}

function statusLine(plan: BillingSummary["plan"]): { label: string; tone: "ok" | "warn" | "muted" } {
    if (plan.status === "trialing") return { label: `Trial until ${formatDate(plan.trialEnd)}`, tone: "ok" }
    if (plan.status === "active" && plan.cancelAtPeriodEnd) {
        return { label: `Cancels on ${formatDate(plan.currentPeriodEnd)}`, tone: "warn" }
    }
    if (plan.status === "active") return { label: `Renews ${formatDate(plan.currentPeriodEnd)}`, tone: "ok" }
    if (plan.status === "past_due") return { label: "Payment past due — update your payment method", tone: "warn" }
    if (plan.status === "canceled" && plan.downgradeGraceUntil && new Date(plan.downgradeGraceUntil) > new Date()) {
        return { label: `Canceled — paid features until ${formatDate(plan.downgradeGraceUntil)}`, tone: "warn" }
    }
    if (plan.hasSubscription) return { label: "No active subscription", tone: "muted" }
    return { label: "Free plan", tone: "muted" }
}

function UsageMeter({ label, used, limit }: { label: string; used: string; limit: string }) {
    return (
        <div
            className="rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
            <p className="text-xs text-white/40 font-medium">{label}</p>
            <p className="text-sm text-white mt-1">
                <span className="font-semibold">{used}</span>
                <span className="text-white/35"> / {limit}</span>
            </p>
        </div>
    )
}

export function SubscriptionView() {
    const { toast } = useToast()
    const { data, isLoading, error } = useSWR<BillingSummary>("/api/billing/summary", fetcher)
    const [interval, setInterval] = useState<"month" | "year">("month")
    const [pendingAction, setPendingAction] = useState<string | null>(null)

    // Checkout return states arrive as ?billing=success|cancelled.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const billing = params.get("billing")
        if (!billing) return
        if (billing === "success") {
            toast({ title: "Subscription started", description: "Your plan updates as soon as Stripe confirms the payment." })
        } else if (billing === "cancelled") {
            toast({ title: "Checkout cancelled", description: "No changes were made to your plan." })
        }
        params.delete("billing")
        params.delete("session_id")
        const query = params.toString()
        window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""))
    }, [toast])

    const startCheckout = async (plan: "pro" | "agency") => {
        setPendingAction(`checkout:${plan}`)
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, interval }),
            })
            const payload = await res.json().catch(() => null)
            if (!res.ok || !payload?.url) throw new Error(payload?.error || "Failed to start checkout")
            window.location.assign(payload.url)
        } catch (err) {
            toast({
                title: "Could not start checkout",
                description: err instanceof Error ? err.message : "Please try again.",
                variant: "destructive",
            })
            setPendingAction(null)
        }
    }

    const openPortal = async () => {
        setPendingAction("portal")
        try {
            const res = await fetch("/api/billing/portal", { method: "POST" })
            const payload = await res.json().catch(() => null)
            if (!res.ok || !payload?.url) throw new Error(payload?.error || "Failed to open billing portal")
            window.location.assign(payload.url)
        } catch (err) {
            toast({
                title: "Could not open billing portal",
                description: err instanceof Error ? err.message : "Please try again.",
                variant: "destructive",
            })
            setPendingAction(null)
        }
    }

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto flex items-center justify-center py-24 text-white/40">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading billing…
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="max-w-4xl mx-auto py-24 text-center text-white/40 text-sm">
                Could not load billing information. Refresh to try again.
            </div>
        )
    }

    const status = statusLine(data.plan)
    const currentTier = data.plan.tier

    return (
        <div className="max-w-4xl mx-auto space-y-7 pb-16">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[22px] font-bold text-white tracking-tight">Plans &amp; Billing</h1>
                    <p className="text-sm mt-0.5 text-white/35">
                        Workspace subscription, plan limits, and monthly usage.
                    </p>
                </div>
                <div
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
                    style={{
                        background: currentTier === "free" ? "rgba(107,114,128,0.14)" : "rgba(34,211,238,0.12)",
                        color: currentTier === "free" ? "#d1d5db" : "#67e8f9",
                        border: `1px solid ${currentTier === "free" ? "rgba(107,114,128,0.28)" : "rgba(34,211,238,0.28)"}`,
                    }}
                >
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {currentTier} plan
                </div>
            </div>

            {/* Current plan / status card */}
            <div
                className="rounded-2xl p-6 relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
                <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.45), transparent)" }}
                />
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4">
                        <div
                            className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                            style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.24)" }}
                        >
                            <CreditCard className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-base font-bold text-white capitalize">{currentTier} plan</p>
                            <p
                                className="text-sm mt-0.5"
                                style={{ color: status.tone === "warn" ? "#fbbf24" : status.tone === "ok" ? "#34d399" : "rgba(255,255,255,0.4)" }}
                            >
                                {status.tone === "warn" && <ShieldAlert className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                                {status.label}
                            </p>
                        </div>
                    </div>
                    {data.plan.hasSubscription && data.canManageBilling && (
                        <button
                            onClick={openPortal}
                            disabled={pendingAction !== null}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                            {pendingAction === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                            Manage billing
                        </button>
                    )}
                </div>
            </div>

            {!data.billingAvailable ? (
                <div
                    className="rounded-2xl p-6 text-sm text-white/45"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    Paid plans are not enabled on this deployment yet. Your workspace stays fully usable on the current plan.
                </div>
            ) : (
                <>
                    {/* Interval toggle */}
                    <div className="flex items-center justify-center gap-1 rounded-xl p-1 w-fit mx-auto"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                        {(["month", "year"] as const).map((value) => (
                            <button
                                key={value}
                                onClick={() => setInterval(value)}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
                                style={interval === value
                                    ? { background: "rgba(34,211,238,0.14)", color: "#67e8f9", border: "1px solid rgba(34,211,238,0.3)" }
                                    : { color: "rgba(255,255,255,0.4)" }}
                            >
                                {value === "month" ? "Monthly" : "Yearly (2 months free)"}
                            </button>
                        ))}
                    </div>

                    {/* Plan cards */}
                    <div className="grid md:grid-cols-3 gap-5">
                        {PLAN_CARDS.map(({ tier, name, icon: Icon, accent, monthly, yearly, blurb, features }) => {
                            const isCurrent = tier === currentTier
                            const price = interval === "month" ? monthly : yearly
                            const canUpgrade = tier !== "free" && !isCurrent && data.plan.canStartCheckout && data.canManageBilling
                            const isPending = pendingAction === `checkout:${tier}`
                            return (
                                <div
                                    key={tier}
                                    className="rounded-2xl p-5 flex flex-col"
                                    style={{
                                        background: "rgba(255,255,255,0.025)",
                                        border: `1px solid ${isCurrent ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.06)"}`,
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" style={{ color: accent }} />
                                            <span className="text-sm font-bold text-white">{name}</span>
                                        </div>
                                        {isCurrent && (
                                            <span
                                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                                                style={{ background: "rgba(34,211,238,0.12)", color: "#67e8f9", border: "1px solid rgba(34,211,238,0.28)" }}
                                            >
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-2xl font-black text-white">
                                        ${price}
                                        <span className="text-xs font-medium text-white/35"> / {interval}</span>
                                    </p>
                                    <p className="text-xs text-white/40 mt-1 mb-4">{blurb}</p>
                                    <ul className="space-y-2 text-sm text-white/55 flex-1">
                                        {features.map((feature) => (
                                            <li key={feature} className="flex items-start gap-2">
                                                <BadgeCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-white/25" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                    {tier !== "free" && (
                                        <button
                                            onClick={() => startCheckout(tier)}
                                            disabled={!canUpgrade || pendingAction !== null}
                                            title={
                                                isCurrent
                                                    ? "This is the current plan"
                                                    : !data.canManageBilling
                                                        ? "Only the workspace owner can manage billing"
                                                        : !data.plan.canStartCheckout
                                                            ? "Use 'Manage billing' to change an active subscription"
                                                            : undefined
                                            }
                                            className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                            style={{
                                                background: isCurrent ? "rgba(255,255,255,0.05)" : "rgba(34,211,238,0.14)",
                                                color: isCurrent ? "rgba(255,255,255,0.5)" : "#67e8f9",
                                                border: `1px solid ${isCurrent ? "rgba(255,255,255,0.08)" : "rgba(34,211,238,0.3)"}`,
                                            }}
                                        >
                                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                            {isCurrent ? "Current plan" : `Upgrade to ${name}`}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {/* Usage */}
            <div
                className="rounded-2xl p-6"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <Gauge className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-sm font-semibold text-white">Usage this month</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <UsageMeter
                        label="Scheduled posts"
                        used={String(data.usage.scheduledPosts)}
                        limit={String(data.limits.scheduledPostsPerMonth)}
                    />
                    <UsageMeter
                        label="Media storage"
                        used={formatBytes(data.usage.mediaUploadBytes)}
                        limit={formatBytes(data.limits.mediaQuotaBytes)}
                    />
                    <UsageMeter
                        label="Generated assets"
                        used={formatBytes(data.usage.generatedAssetBytes)}
                        limit={formatBytes(data.limits.generatedAssetQuotaBytes)}
                    />
                    {/* AI is BYOK on every plan: it runs on the workspace's own
                        provider key and is never metered against the plan. */}
                    <div
                        className="rounded-xl px-4 py-3"
                        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                        <p className="text-xs text-white/40 font-medium">AI usage</p>
                        <p className="text-sm text-white mt-1 font-semibold">Your own key (BYOK)</p>
                        <p className="text-[11px] text-white/30 mt-0.5">Not metered by your plan</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
