import Link from "next/link"
import {
    ArrowRight,
    Bot,
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    FileEdit,
    Instagram,
    MessageCircleMore,
    Plus,
    Radio,
    Send,
    Sparkles,
    WandSparkles,
    Zap,
} from "lucide-react"

import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import {
    RecentActivityDropdown,
    type RecentAction,
} from "@/components/dashboard/recent-activity-dropdown"
import { cn } from "@/lib/utils"

type OverviewCommandCenterProps = {
    workspaceId: string
    workspaceName: string
    counts: {
        drafts: number
        scheduled: number
        published: number
        failed: number
    }
    connections: {
        instagramName: string | null
        facebookName: string | null
        publishReady: boolean
    }
    latestFailure: string | null
    activities: RecentAction[]
    isReviewPhase1Release?: boolean
}

const metricCards = [
    {
        key: "drafts" as const,
        label: "Drafts",
        description: "Ideas waiting for a final pass",
        href: "/dashboard/scheduled?tab=drafts",
        icon: FileEdit,
        tone: "amber",
    },
    {
        key: "scheduled" as const,
        label: "Scheduled",
        description: "Approved content in the queue",
        href: "/dashboard/scheduled?tab=scheduled",
        icon: CalendarClock,
        tone: "cyan",
    },
    {
        key: "published" as const,
        label: "Published",
        description: "Content delivered successfully",
        href: "/dashboard/scheduled?tab=published",
        icon: CheckCircle2,
        tone: "emerald",
    },
    {
        key: "failed" as const,
        label: "Needs attention",
        description: "Publishing runs that need review",
        href: "/dashboard/scheduled?tab=failed",
        icon: CircleAlert,
        tone: "rose",
    },
]

const toneClasses = {
    amber: "border-amber-300/15 bg-amber-300/[0.07] text-amber-200",
    cyan: "border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200",
    emerald: "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200",
    rose: "border-rose-300/15 bg-rose-300/[0.07] text-rose-200",
}

export function OverviewCommandCenter({
    workspaceId,
    workspaceName,
    counts,
    connections,
    latestFailure,
    activities,
    isReviewPhase1Release = false,
}: OverviewCommandCenterProps) {
    const connectedAccounts = Number(Boolean(connections.instagramName)) + Number(Boolean(connections.facebookName))
    const queueSize = counts.drafts + counts.scheduled
    const hasContent = queueSize + counts.published > 0

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
                                    Live workspace
                                </span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">
                                    {workspaceName}
                                </span>
                            </div>

                            <h1 id="overview-heading" className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                                Your social operation,
                                <span className="block bg-linear-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-transparent">
                                    ready at a glance.
                                </span>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                                Move content from idea to published, keep every connection healthy, and launch automations without hunting through the product.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <CreatePostTrigger workspaceId={workspaceId}>
                                <button
                                    type="button"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/20 bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:brightness-105"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Create content
                                </button>
                            </CreatePostTrigger>
                            <Link
                                href="/dashboard/automation"
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/80 transition hover:border-violet-300/20 hover:bg-violet-300/[0.08] hover:text-white"
                            >
                                <Zap className="h-4 w-4 text-violet-200" aria-hidden="true" />
                                Open automations
                            </Link>
                            <Link
                                href="/dashboard/assistant"
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-sm font-medium text-white/52 transition hover:bg-white/[0.04] hover:text-white/80"
                            >
                                <WandSparkles className="h-4 w-4" aria-hidden="true" />
                                Create with AI
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Operational readiness</p>
                                <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                                    {connections.publishReady ? "Ready to publish" : "Setup needs attention"}
                                </p>
                            </div>
                            <RecentActivityDropdown activities={activities} />
                        </div>

                        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-[width]",
                                    connections.publishReady
                                        ? "w-full bg-linear-to-r from-emerald-400 to-cyan-300"
                                        : connectedAccounts > 0
                                            ? "w-2/3 bg-linear-to-r from-amber-400 to-cyan-300"
                                            : "w-1/4 bg-rose-300/80",
                                )}
                            />
                        </div>

                        <div className="mt-5 space-y-3">
                            <ReadinessRow
                                icon={Instagram}
                                label="Instagram"
                                value={connections.instagramName || "Not connected"}
                                ready={Boolean(connections.instagramName)}
                            />
                            <ReadinessRow
                                icon={MessageCircleMore}
                                label="Facebook"
                                value={connections.facebookName || "Optional for Instagram automations"}
                                ready={Boolean(connections.facebookName)}
                                optional
                            />
                            <ReadinessRow
                                icon={Send}
                                label="Publishing"
                                value={connections.publishReady ? "Provider permissions verified" : "Verify permissions before publishing"}
                                ready={connections.publishReady}
                            />
                        </div>

                        <Link
                            href="/dashboard/onboarding/instagram"
                            className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200/72 transition hover:text-cyan-100"
                        >
                            Review setup
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metricCards.map((metric) => {
                    const Icon = metric.icon
                    const count = counts[metric.key]
                    return (
                        <Link
                            key={metric.key}
                            href={metric.href}
                            className="group rounded-2xl border border-white/[0.07] bg-[#11141e] p-4 transition hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-[#141824]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", toneClasses[metric.tone as keyof typeof toneClasses])}>
                                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                                </span>
                                <ArrowRight className="h-4 w-4 text-white/18 transition group-hover:translate-x-0.5 group-hover:text-white/45" aria-hidden="true" />
                            </div>
                            <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white tabular-nums">{count}</p>
                            <p className="mt-1 text-sm font-semibold text-white/76">{metric.label}</p>
                            <p className="mt-1 text-xs leading-5 text-white/34">{metric.description}</p>
                        </Link>
                    )
                })}
            </div>

            {counts.failed > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/[0.08] text-rose-200">
                            <CircleAlert className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-rose-100">A publishing run needs attention</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-rose-100/55">
                                {latestFailure || "Open the failed queue to inspect the provider response and retry safely."}
                            </p>
                        </div>
                    </div>
                    <Link href="/dashboard/scheduled?tab=failed" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-rose-100/78 transition hover:text-white">
                        Review failure
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
                <LaunchCard
                    icon={Sparkles}
                    eyebrow="Creative"
                    title={hasContent ? "Create the next campaign" : "Start your first campaign"}
                    description="Move from an AI-assisted idea to a scheduled post without leaving the workspace."
                    href="/dashboard/assistant"
                    accent="cyan"
                />
                <LaunchCard
                    icon={Zap}
                    eyebrow="Automation"
                    title="Build an engagement flow"
                    description="Turn comments, messages, and story replies into reliable actions."
                    href="/dashboard/automation"
                    accent="violet"
                />
                <LaunchCard
                    icon={Bot}
                    eyebrow="Intelligence"
                    title="Review performance signals"
                    description={isReviewPhase1Release ? "Analytics becomes available in the full release channel." : "Use real account data to shape the next content decision."}
                    href={isReviewPhase1Release ? "/dashboard/settings" : "/dashboard/analytics"}
                    accent="amber"
                />
            </div>
        </section>
    )
}

function ReadinessRow({
    icon: Icon,
    label,
    value,
    ready,
    optional = false,
}: {
    icon: typeof Instagram
    label: string
    value: string
    ready: boolean
    optional?: boolean
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.025] p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-white/48">
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/64">{label}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/32">{value}</p>
            </div>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", ready ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.65)]" : optional ? "bg-white/18" : "bg-amber-300")} />
        </div>
    )
}

function LaunchCard({
    icon: Icon,
    eyebrow,
    title,
    description,
    href,
    accent,
}: {
    icon: typeof Sparkles
    eyebrow: string
    title: string
    description: string
    href: string
    accent: "cyan" | "violet" | "amber"
}) {
    const accentClass = {
        cyan: "from-cyan-300/18 text-cyan-200",
        violet: "from-violet-300/18 text-violet-200",
        amber: "from-amber-300/18 text-amber-200",
    }[accent]

    return (
        <Link
            href={href}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#10131c] p-5 transition hover:-translate-y-0.5 hover:border-white/[0.13]"
        >
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
