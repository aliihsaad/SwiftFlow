"use client"

import { useState } from "react"
import {
    Zap,
    Crown,
    CreditCard,
    Calendar,
    ArrowRight,
    Sparkles,
    Shield,
    BarChart3,
    Bot,
    Inbox,
    Globe,
    ChevronRight,
    Clock,
    AlertCircle,
    Bolt,
    TrendingUp,
    Users,
    Layers,
} from "lucide-react"

/* ─── Types ─────────────────────────────── */
type Plan = "free" | "pro"
type Cycle = "monthly" | "yearly"

/* ─── Feature lists ─────────────────────── */
const FREE_FEATURES = [
    { icon: Globe, label: "Instagram + Facebook publishing" },
    { icon: Calendar, label: "Scheduled posts" },
    { icon: Bot, label: "AI Assistant (10 credits/mo)" },
    { icon: Inbox, label: "Unified message inbox" },
    { icon: BarChart3, label: "Basic analytics" },
    { icon: Zap, label: "Up to 3 automation rules" },
]

const PRO_FEATURES = [
    { icon: Crown, label: "Everything in Free" },
    { icon: Sparkles, label: "Unlimited AI generation" },
    { icon: Zap, label: "Unlimited automation rules" },
    { icon: BarChart3, label: "Advanced analytics & exports" },
    { icon: Inbox, label: "Priority inbox & smart labels" },
    { icon: Shield, label: "Custom brand voice profiles" },
    { icon: Users, label: "Team members & collaboration" },
    { icon: Calendar, label: "Bulk post scheduling" },
]

/* ─── Small helpers ─────────────────────── */
function Tag({ children, accent }: { children: React.ReactNode; accent: string }) {
    return (
        <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}35` }}
        >
            {children}
        </span>
    )
}

function PlanFeature({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
    return (
        <div className="flex items-center gap-3 group">
            <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                style={{ background: `${color}12`, border: `1px solid ${color}25` }}
            >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
            <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">{label}</span>
        </div>
    )
}

/* ─── Main ──────────────────────────────── */
export function SubscriptionView() {
    const [cycle, setCycle] = useState<Cycle>("yearly")

    // Placeholder — will be replaced by real Stripe data
    const [currentPlan] = useState<Plan>("free")

    const MONTHLY = 19
    const YEARLY_TOTAL = Math.round(MONTHLY * 12 * 0.75)
    const shownPerMonth = cycle === "yearly" ? Math.round(YEARLY_TOTAL / 12) : MONTHLY
    const annualSaving = MONTHLY * 12 - YEARLY_TOTAL

    return (
        <div className="max-w-5xl mx-auto space-y-7 pb-16">

            {/* ── Header ──────────────────────────── */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[22px] font-bold text-white tracking-tight">Subscription</h1>
                    <p className="text-sm mt-0.5 text-white/35">Manage your plan and billing.</p>
                </div>
                {currentPlan === "free" && (
                    <button
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{
                            background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 60%, #8b5cf6 100%)",
                            boxShadow: "0 4px 20px rgba(245,158,11,0.25)",
                        }}
                    >
                        <Crown className="h-4 w-4" /> Upgrade to Pro
                    </button>
                )}
            </div>

            {/* ── Current plan status bar ─────────── */}
            <div
                className="rounded-2xl overflow-hidden relative"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            >
                {/* Gradient stripe top edge */}
                <div
                    className="absolute inset-x-0 top-0 h-0.5"
                    style={{ background: currentPlan === "pro" ? "linear-gradient(90deg,#8b5cf6,#06b6d4)" : "linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.12),rgba(255,255,255,0.06))" }}
                />
                <div
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5"
                    style={{ background: "rgba(255,255,255,0.025)" }}
                >
                    {/* Icon */}
                    <div
                        className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
                        style={
                            currentPlan === "pro"
                                ? { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
                        }
                    >
                        {currentPlan === "pro"
                            ? <Crown className="h-6 w-6 text-amber-400" />
                            : <Layers className="h-6 w-6 text-white/30" />
                        }
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-base font-bold text-white">
                                {currentPlan === "pro" ? "Pro Plan" : "Free Plan"}
                            </span>
                            <Tag accent={currentPlan === "pro" ? "#8b5cf6" : "#6b7280"}>
                                {currentPlan === "pro" ? "● Active" : "Free Tier"}
                            </Tag>
                        </div>
                        <p className="text-sm text-white/35 mt-0.5">
                            {currentPlan === "pro"
                                ? "All features unlocked. Next charge on March 26, 2026."
                                : "Using the free tier — limited AI credits and automations."}
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 shrink-0">
                        {[
                            { label: "Posts", val: "12" },
                            { label: "AI Credits", val: "3/10" },
                            { label: "Automations", val: "1/3" },
                        ].map(s => (
                            <div key={s.label} className="text-center hidden md:block">
                                <div className="text-lg font-bold text-white">{s.val}</div>
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Usage meters ────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "AI Credits", used: 3, max: 10, accent: "#06b6d4" },
                    { label: "Automations", used: 1, max: 3, accent: "#f59e0b" },
                    { label: "Scheduled Posts", used: 12, max: null, accent: "#22c55e" },
                    { label: "Team Members", used: 1, max: 1, accent: "#a78bfa" },
                ].map(({ label, used, max, accent }) => {
                    const pct = max ? Math.round((used / max) * 100) : null
                    return (
                        <div
                            key={label}
                            className="rounded-xl p-4 flex flex-col gap-2"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-white/35 uppercase tracking-widest truncate">{label}</span>
                                <TrendingUp className="h-3 w-3 shrink-0" style={{ color: accent }} />
                            </div>
                            <div className="text-xl font-bold text-white">
                                {used}{max ? <span className="text-sm font-normal text-white/25">/{max}</span> : <span className="text-sm font-normal text-white/25"> used</span>}
                            </div>
                            {pct !== null && (
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${pct}%`, background: pct > 80 ? "#ef4444" : accent }}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ── Plan Cards ──────────────────────── */}
            <div>
                {/* Cycle toggle */}
                <div className="flex items-center justify-center mb-7">
                    <div
                        className="inline-flex items-center p-1 rounded-xl gap-1"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                        {(["monthly", "yearly"] as Cycle[]).map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setCycle(c)}
                                className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all duration-200"
                                style={{
                                    background: cycle === c ? "rgba(255,255,255,0.08)" : "transparent",
                                    color: cycle === c ? "white" : "rgba(255,255,255,0.35)",
                                    border: cycle === c ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                                }}
                            >
                                {c}
                                {c === "yearly" && (
                                    <span
                                        className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                                    >
                                        SAVE 25%
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-5">

                    {/* ── Free card ──────────────── */}
                    <div
                        className="rounded-2xl p-7 flex flex-col relative"
                        style={{
                            background: "rgba(255,255,255,0.025)",
                            border: currentPlan === "free"
                                ? "1px solid rgba(255,255,255,0.18)"
                                : "1px solid rgba(255,255,255,0.07)",
                        }}
                    >
                        {currentPlan === "free" && (
                            <div
                                className="absolute inset-x-0 top-0 h-px"
                                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
                            />
                        )}

                        <div className="flex items-start justify-between mb-1">
                            <span className="font-bold text-white text-lg">Free</span>
                            {currentPlan === "free" && <Tag accent="#64748b">Current plan</Tag>}
                        </div>

                        <div className="mb-7 mt-1">
                            <span className="text-5xl font-black text-white">$0</span>
                            <span className="text-sm text-white/30 ml-1">/ forever</span>
                        </div>

                        <div className="space-y-3.5 flex-1 mb-7">
                            {FREE_FEATURES.map(f => (
                                <PlanFeature key={f.label} icon={f.icon} label={f.label} color="#64748b" />
                            ))}
                        </div>

                        <button
                            disabled
                            className="w-full py-3 rounded-xl text-sm font-semibold text-center"
                            style={{
                                background: "rgba(255,255,255,0.04)",
                                color: "rgba(255,255,255,0.25)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                cursor: "not-allowed",
                            }}
                        >
                            {currentPlan === "free" ? "Your current plan" : "Downgrade to Free"}
                        </button>
                    </div>

                    {/* ── Pro card ───────────────── */}
                    <div
                        className="rounded-2xl p-7 flex flex-col relative overflow-hidden"
                        style={{
                            background: "linear-gradient(150deg, rgba(15,10,30,1) 0%, rgba(8,8,20,1) 100%)",
                            border: "1px solid rgba(245,158,11,0.25)",
                            boxShadow: "0 0 60px rgba(245,158,11,0.06), 0 0 120px rgba(139,92,246,0.06)",
                        }}
                    >
                        {/* Radial glows */}
                        <div className="absolute top-0 right-0 w-56 h-56 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(245,158,11,0.14), transparent 65%)" }} />
                        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 65%)" }} />
                        {/* Top accent line */}
                        <div
                            className="absolute inset-x-0 top-0 h-px"
                            style={{ background: "linear-gradient(90deg, transparent, #f59e0b, #8b5cf6, transparent)" }}
                        />

                        <div className="flex items-start justify-between mb-1 relative z-10">
                            <div className="flex items-center gap-2">
                                <Crown className="h-4.5 w-4.5 text-amber-400" />
                                <span className="font-bold text-white text-lg">Pro</span>
                            </div>
                            <Tag accent={currentPlan === "pro" ? "#22c55e" : "#f59e0b"}>
                                {currentPlan === "pro" ? "● Active" : "Coming Soon"}
                            </Tag>
                        </div>

                        {/* Price */}
                        <div className="mb-1 mt-1 relative z-10">
                            <span className="text-5xl font-black text-white">${shownPerMonth}</span>
                            <span className="text-sm text-white/30 ml-1">/ mo</span>
                        </div>
                        {cycle === "yearly" ? (
                            <p className="text-xs text-white/30 mb-7 relative z-10">
                                ${YEARLY_TOTAL} billed yearly — you save <span className="text-emerald-400 font-semibold">${annualSaving}</span>
                            </p>
                        ) : (
                            <div className="mb-7" />
                        )}

                        <div className="space-y-3.5 flex-1 mb-7 relative z-10">
                            {PRO_FEATURES.map(f => (
                                <PlanFeature key={f.label} icon={f.icon} label={f.label} color="#f59e0b" />
                            ))}
                        </div>

                        <button
                            className="w-full py-3 rounded-xl text-sm font-bold text-white text-center transition-all hover:opacity-90 active:scale-95 relative z-10 flex items-center justify-center gap-2"
                            style={{
                                background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 55%, #8b5cf6 100%)",
                                boxShadow: "0 6px 24px rgba(245,158,11,0.3)",
                            }}
                        >
                            {currentPlan === "pro" ? (
                                <><CreditCard className="h-4 w-4" /> Manage billing</>
                            ) : (
                                <><Crown className="h-4 w-4" /> Upgrade to Pro <ArrowRight className="h-4 w-4" /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Billing info row ────────────────── */}
            <div className="grid md:grid-cols-2 gap-5">

                {/* Payment method */}
                <div
                    className="rounded-2xl p-6"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.2)" }}>
                                <CreditCard className="h-3.5 w-3.5 text-cyan-400" />
                            </div>
                            <h3 className="font-semibold text-white text-sm">Payment Method</h3>
                        </div>
                        <button className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                            + Add
                        </button>
                    </div>
                    <div
                        className="flex items-center gap-3 rounded-xl p-4"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                        <AlertCircle className="h-5 w-5 text-white/15 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-white/35">No payment method</p>
                            <p className="text-xs text-white/20 mt-0.5">Add a card to upgrade your plan</p>
                        </div>
                    </div>
                </div>

                {/* Billing history */}
                <div
                    className="rounded-2xl p-6"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" }}>
                                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <h3 className="font-semibold text-white text-sm">Billing History</h3>
                        </div>
                    </div>
                    <div
                        className="flex flex-col items-center justify-center py-7 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)" }}
                    >
                        <Clock className="h-7 w-7 mb-2.5 text-white/10" />
                        <p className="text-sm text-white/25 font-medium">No invoices yet</p>
                        <p className="text-xs text-white/15 mt-1">Charges will appear here once you upgrade</p>
                    </div>
                </div>
            </div>

            {/* ── Roadmap / Coming to Pro ─────────── */}
            <div
                className="rounded-2xl p-6 relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(245,158,11,0.05), transparent 70%)" }} />
                <div className="flex items-center gap-2 mb-5 relative z-10">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <h3 className="font-semibold text-white text-sm">On the Roadmap</h3>
                    <span className="ml-1 text-[10px] font-bold text-amber-400/60 uppercase tracking-widest">Pro tier</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5 relative z-10">
                    {[
                        { icon: Users, label: "Team collaboration & invites", color: "#06b6d4" },
                        { icon: Globe, label: "Multi-workspace management", color: "#8b5cf6" },
                        { icon: BarChart3, label: "White-label analytics reports", color: "#22c55e" },
                        { icon: Bolt, label: "API access & webhooks", color: "#f59e0b" },
                    ].map(({ icon: Icon, label, color }) => (
                        <div
                            key={label}
                            className="flex items-center gap-3 rounded-xl px-4 py-3 group hover:bg-white/3 transition-colors"
                            style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                        >
                            <div
                                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${color}10`, border: `1px solid ${color}20` }}
                            >
                                <Icon className="h-3.5 w-3.5" style={{ color }} />
                            </div>
                            <span className="text-sm text-white/45 group-hover:text-white/65 transition-colors">{label}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-white/15 ml-auto shrink-0" />
                        </div>
                    ))}
                </div>
            </div>

        </div>
    )
}
