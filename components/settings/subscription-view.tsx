"use client"

import Link from "next/link"
import {
    ArrowRight,
    Bot,
    Calendar,
    CheckCircle2,
    Clock3,
    Globe,
    Layers3,
    LineChart,
    Shield,
    Users,
} from "lucide-react"

const readinessItems = [
    {
        icon: Globe,
        title: "Platform limits first",
        description: "Paid plans will be based on connected accounts, scheduling volume, automation volume, exports, and team seats.",
    },
    {
        icon: Bot,
        title: "BYOK AI stays separate",
        description: "AI provider costs stay on the workspace owner's key instead of being bundled as fake app-side credits.",
    },
    {
        icon: LineChart,
        title: "Analytics only after enforcement",
        description: "Analytics and reporting upgrades will only be sold once entitlement checks and retention rules are implemented.",
    },
    {
        icon: Users,
        title: "Workspace billing model",
        description: "Billing will be tied to the workspace so access, limits, and team management can be enforced consistently.",
    },
] as const

const truthItems = [
    "There is no live checkout or Stripe customer portal.",
    "There are no enforced usage caps tied to subscription plans.",
    "There is no invoice history or payment-method management in production.",
    "The product can still be used without a paid billing relationship.",
] as const

const foundationItems = [
    "One workspace-level subscription record",
    "One entitlement model for accounts, scheduling, automations, exports, and seats",
    "Usage tracking before any paid marketing claims go live",
    "Stripe checkout and webhook handling after entitlement enforcement exists",
] as const

export function SubscriptionView() {
    return (
        <div className="max-w-4xl mx-auto space-y-7 pb-16">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[22px] font-bold text-white tracking-tight">Plans</h1>
                    <p className="text-sm mt-0.5 text-white/35">
                        Billing is not live yet. This page tracks the planned monetization structure only.
                    </p>
                </div>
                <div
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.28)" }}
                >
                    <Clock3 className="h-3.5 w-3.5" />
                    Roadmap Only
                </div>
            </div>

            <div
                className="rounded-2xl p-6 relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
                <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.45), transparent)" }}
                />
                <div className="flex items-start gap-4">
                    <div
                        className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.24)" }}
                    >
                        <Layers3 className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-white">Billing foundation pending</span>
                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                                style={{ background: "rgba(107,114,128,0.18)", color: "#d1d5db", border: "1px solid rgba(107,114,128,0.28)" }}
                            >
                                No Checkout Yet
                            </span>
                        </div>
                        <p className="text-sm text-white/45 max-w-2xl">
                            The app does not have live billing, invoices, payment methods, usage enforcement, or entitlement checks yet.
                            Until those systems exist, pricing remains informational only and no in-app upgrade flow is presented as active.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                {readinessItems.map(({ icon: Icon, title, description }) => (
                    <div
                        key={title}
                        className="rounded-2xl p-5"
                        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <div className="flex items-start gap-3">
                            <div
                                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                            >
                                <Icon className="h-4 w-4 text-white/70" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-white">{title}</h2>
                                <p className="text-sm text-white/45 mt-1 leading-relaxed">{description}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div
                className="rounded-2xl p-6"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">What is true today</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    {truthItems.map((item) => (
                        <div
                            key={item}
                            className="rounded-xl px-4 py-3 text-sm text-white/65"
                            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                            {item}
                        </div>
                    ))}
                </div>
            </div>

            <div
                className="rounded-2xl p-6"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="flex items-center gap-2 mb-5">
                    <Shield className="h-4 w-4 text-amber-400" />
                    <h2 className="font-semibold text-white text-sm">Planned billing foundation</h2>
                </div>
                <div className="space-y-3">
                    {foundationItems.map((item) => (
                        <div key={item} className="flex items-start gap-3 text-sm text-white/55">
                            <Calendar className="h-4 w-4 text-white/30 mt-0.5 shrink-0" />
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-white/40 max-w-2xl">
                    Until subscriptions are implemented properly, plans should remain roadmap context rather than an active product surface.
                </p>
                <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                    View public roadmap <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    )
}
