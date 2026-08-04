import Link from "next/link"
import {
    Activity,
    ArrowRight,
    Bot,
    CircleAlert,
    Instagram,
    MessageCircleMore,
    Radio,
    ShieldCheck,
    Workflow,
    Zap,
} from "lucide-react"

import {
    RecentActivityDropdown,
    type RecentAction,
} from "@/components/dashboard/recent-activity-dropdown"
import { cn } from "@/lib/utils"

type OverviewCommandCenterProps = {
    workspaceName: string
    counts: {
        activeAutomations: number
        totalAutomations: number
        runsToday: number
        failedRuns: number
    }
    connections: {
        instagramName: string | null
        automationReady: boolean
    }
    latestFailure: string | null
    activities: RecentAction[]
    isReviewPhase1Release?: boolean
}

const metricCards = [
    { key: "activeAutomations" as const, label: "Live journeys", detail: "Automations currently listening", icon: Zap, tone: "emerald" },
    { key: "totalAutomations" as const, label: "Workflows", detail: "Journeys in this workspace", icon: Workflow, tone: "cyan" },
    { key: "runsToday" as const, label: "Runs today", detail: "Provider events processed today", icon: Activity, tone: "violet" },
    { key: "failedRuns" as const, label: "Needs attention", detail: "Failed runs since midnight", icon: CircleAlert, tone: "rose" },
]

const toneClasses = {
    cyan: "border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200",
    violet: "border-violet-300/15 bg-violet-300/[0.07] text-violet-200",
    emerald: "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200",
    rose: "border-rose-300/15 bg-rose-300/[0.07] text-rose-200",
}

export function OverviewCommandCenter({
    workspaceName,
    counts,
    connections,
    latestFailure,
    activities,
    isReviewPhase1Release = false,
}: OverviewCommandCenterProps) {
    return (
        <section className="space-y-5" aria-labelledby="overview-heading">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#10131e] shadow-[0_28px_90px_rgba(2,4,12,0.34)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(103,232,249,0.12),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(139,92,246,0.18),transparent_38%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-200/40 to-transparent" />

                <div className="relative grid gap-8 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:p-8">
                    <div className="flex min-w-0 flex-col justify-between gap-8">
                        <div>
                            <div className="mb-5 flex flex-wrap items-center gap-2">
                                <span className="sf-kicker">
                                    <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                                    Live engagement workspace
                                </span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">
                                    {workspaceName}
                                </span>
                            </div>

                            <h1 id="overview-heading" className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                                Every customer signal,
                                <span className="block bg-linear-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-transparent">
                                    one precise next action.
                                </span>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                                Monitor conversations, launch reliable automations, and measure outcomes from one focused workspace.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <PrimaryLink href="/dashboard/automation" icon={Zap}>Open automations</PrimaryLink>
                            <SecondaryLink href="/dashboard/messages" icon={MessageCircleMore}>Open inbox</SecondaryLink>
                            {!isReviewPhase1Release ? (
                                <SecondaryLink href="/dashboard/analytics" icon={Activity}>Review analytics</SecondaryLink>
                            ) : null}
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Automation readiness</p>
                                <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                                    {connections.automationReady ? "Ready for live events" : "Setup needs attention"}
                                </p>
                            </div>
                            <RecentActivityDropdown activities={activities} />
                        </div>

                        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-[width]",
                                    connections.automationReady
                                        ? "w-full bg-linear-to-r from-emerald-400 to-cyan-300"
                                        : connections.instagramName
                                            ? "w-2/3 bg-linear-to-r from-amber-400 to-cyan-300"
                                            : "w-1/4 bg-rose-300/80",
                                )}
                            />
                        </div>

                        <div className="mt-5 space-y-3">
                            <ReadinessRow icon={Instagram} label="Instagram" value={connections.instagramName || "Not connected"} ready={Boolean(connections.instagramName)} />
                            <ReadinessRow icon={ShieldCheck} label="Event pipeline" value={connections.automationReady ? "Webhooks and actions available" : "Connect Instagram to continue"} ready={connections.automationReady} />
                        </div>

                        <Link href="/dashboard/onboarding/instagram" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200/72 transition hover:text-cyan-100">
                            Review setup
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metricCards.map((metric) => {
                    const Icon = metric.icon
                    return (
                        <Link key={metric.key} href="/dashboard/automation" className="group rounded-2xl border border-white/[0.07] bg-[#11141e] p-4 transition hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-[#141824]">
                            <div className="flex items-start justify-between gap-3">
                                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", toneClasses[metric.tone as keyof typeof toneClasses])}>
                                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                                </span>
                                <ArrowRight className="h-4 w-4 text-white/18 transition group-hover:translate-x-0.5 group-hover:text-white/45" aria-hidden="true" />
                            </div>
                            <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white tabular-nums">{counts[metric.key]}</p>
                            <p className="mt-1 text-sm font-semibold text-white/76">{metric.label}</p>
                            <p className="mt-1 text-xs leading-5 text-white/34">{metric.detail}</p>
                        </Link>
                    )
                })}
            </div>

            {counts.failedRuns > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/[0.08] text-rose-200">
                            <CircleAlert className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-rose-100">An automation run needs attention</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-rose-100/55">
                                {latestFailure || "Open run history to inspect the failed node and retry safely."}
                            </p>
                        </div>
                    </div>
                    <Link href="/dashboard/automation" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-rose-100/78 transition hover:text-white">
                        Review runs
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
                <LaunchCard icon={Workflow} eyebrow="Automate" title="Build a customer journey" description="Connect comments, DMs, story replies, conditions, delays, and AI responses." href="/dashboard/automation" accent="cyan" />
                <LaunchCard icon={MessageCircleMore} eyebrow="Engage" title="Work the live inbox" description="Keep provider conversations and response work in one focused queue." href="/dashboard/messages" accent="violet" />
                <LaunchCard icon={Bot} eyebrow="Understand" title="Review performance signals" description="Use account and automation data to decide what to optimize next." href={isReviewPhase1Release ? "/dashboard/settings" : "/dashboard/analytics"} accent="amber" />
            </div>
        </section>
    )
}

function PrimaryLink({ href, icon: Icon, children }: { href: string; icon: typeof Zap; children: React.ReactNode }) {
    return (
        <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/20 bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:brightness-105">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {children}
        </Link>
    )
}

function SecondaryLink({ href, icon: Icon, children }: { href: string; icon: typeof Zap; children: React.ReactNode }) {
    return (
        <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/80 transition hover:border-violet-300/20 hover:bg-violet-300/[0.08] hover:text-white">
            <Icon className="h-4 w-4 text-violet-200" aria-hidden="true" />
            {children}
        </Link>
    )
}

function ReadinessRow({ icon: Icon, label, value, ready }: { icon: typeof Instagram; label: string; value: string; ready: boolean }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.025] p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-white/48">
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/64">{label}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/32">{value}</p>
            </div>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", ready ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.65)]" : "bg-amber-300")} />
        </div>
    )
}

function LaunchCard({ icon: Icon, eyebrow, title, description, href, accent }: { icon: typeof Workflow; eyebrow: string; title: string; description: string; href: string; accent: "cyan" | "violet" | "amber" }) {
    const accentClass = {
        cyan: "from-cyan-300/18 text-cyan-200",
        violet: "from-violet-300/18 text-violet-200",
        amber: "from-amber-300/18 text-amber-200",
    }[accent]

    return (
        <Link href={href} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#10131c] p-5 transition hover:-translate-y-0.5 hover:border-white/[0.13]">
            <div className={cn("pointer-events-none absolute inset-0 bg-linear-to-br to-transparent opacity-60", accentClass.split(" ")[0])} />
            <div className="relative">
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-black/20", accentClass.split(" ")[1])}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-white/55" aria-hidden="true" />
                </div>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.17em] text-white/28">{eyebrow}</p>
                <h2 className="mt-2 text-base font-semibold tracking-[-0.02em] text-white/86">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-white/38">{description}</p>
            </div>
        </Link>
    )
}
