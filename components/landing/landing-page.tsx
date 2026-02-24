"use client"

import { useRef, useEffect, useState } from "react"
import type { Variants } from "framer-motion"
import {
    motion,
    useScroll,
    useTransform,
    useInView,
} from "framer-motion"
import Link from "next/link"
import {
    Zap,
    Sparkles,
    CalendarDays,
    BarChart3,
    MessageSquare,
    Bot,
    Globe,
    ArrowRight,
    Check,
    Instagram,
    Facebook,
    ChevronDown,
    Clock3,
    Activity,
    Send,
    Workflow,
    ShieldCheck,
    LayoutDashboard,
    TimerReset,
    CircleDollarSign,
    HelpCircle,
} from "lucide-react"

/* ─────────────────────────────────
   Shared animation variants
───────────────────────────────── */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const THEME = {
    bg: "#0b0b0f",
    bgSoft: "#111118",
    panel: "#151620",
    panelAlt: "#10111a",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.45)",
    amber: "#f59e0b",
    cyan: "#22d3ee",
    coral: "#fb7185",
    lime: "#84cc16",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: (delay = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: EASE, delay },
    }),
} as any

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
}

/* ─────────────────────────────────
   Reveal wrapper — fires once on scroll into view
───────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-80px" })
    return (
        <motion.div
            ref={ref}
            className={className}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            custom={delay}
            variants={fadeUp}
        >
            {children}
        </motion.div>
    )
}

/* ─────────────────────────────────
   Features data
───────────────────────────────── */
const features = [
    {
        icon: Sparkles,
        title: "AI Content Generation",
        description: "Generate scroll-stopping captions, hashtags, and post ideas in seconds — powered by AI and guided by your saved brand profile.",
        accent: "#22d3ee",
        glow: "rgba(34,211,238,0.16)",
        border: "rgba(34,211,238,0.22)",
    },
    {
        icon: CalendarDays,
        title: "Smart Scheduling",
        description: "Pick your date and time, set it, forget it. Posts go live automatically across your connected platforms.",
        accent: "#f59e0b",
        glow: "rgba(245,158,11,0.16)",
        border: "rgba(245,158,11,0.22)",
    },
    {
        icon: Globe,
        title: "Multi-Platform Publishing",
        description: "Publish to Instagram and Facebook simultaneously from one clean dashboard — no tab switching, no copy-pasting.",
        accent: "#fb7185",
        glow: "rgba(251,113,133,0.14)",
        border: "rgba(251,113,133,0.22)",
    },
    {
        icon: BarChart3,
        title: "Deep Analytics",
        description: "Track views, likes, comments and shares per post. See what works and double down on winning content.",
        accent: "#84cc16",
        glow: "rgba(132,204,22,0.14)",
        border: "rgba(132,204,22,0.22)",
    },
    {
        icon: MessageSquare,
        title: "Unified Message Inbox",
        description: "Manage Instagram and Facebook DMs side-by-side. Reply instantly or let AI draft the perfect response.",
        accent: "#f97316",
        glow: "rgba(249,115,22,0.14)",
        border: "rgba(249,115,22,0.22)",
    },
    {
        icon: Bot,
        title: "Automation Rules",
        description: "Set trigger-based workflows — auto-reply, keyword responses, scheduled actions — so your accounts work 24/7 without you.",
        accent: "#38bdf8",
        glow: "rgba(56,189,248,0.14)",
        border: "rgba(56,189,248,0.22)",
    },
]

/* ─────────────────────────────────
   How it works steps
───────────────────────────────── */
const steps = [
    {
        n: "01",
        title: "Connect Your Accounts",
        description: "Link your Instagram and Facebook Pages with one click via secure OAuth — no passwords stored.",
        accent: "#22d3ee",
    },
    {
        n: "02",
        title: "Create with AI",
        description: "Chat with the AI Assistant to brainstorm ideas, generate captions, and craft posts using your saved brand profile and tone.",
        accent: "#f59e0b",
    },
    {
        n: "03",
        title: "Schedule & Publish",
        description: "Pick the best time, hit schedule, and watch your content go live automatically while you focus elsewhere.",
        accent: "#84cc16",
    },
]

const capabilityGroups = [
    {
        icon: LayoutDashboard,
        title: "One dashboard for the daily work",
        description: "Create posts, manage comments and DMs, check analytics and configure automations without jumping across tools.",
        bullets: ["Posts + scheduling", "Messages inbox", "Analytics", "Automations"],
        accent: THEME.cyan,
    },
    {
        icon: Sparkles,
        title: "AI built into the workflow",
        description: "Use AI for caption generation, reply drafting and automation responses instead of copying prompts into external tools.",
        bullets: ["Caption generation", "AI response node", "Brand-tone friendly replies", "Prompt templates"],
        accent: THEME.amber,
    },
    {
        icon: ShieldCheck,
        title: "Brand profile + voice context",
        description: "Store your business details, positioning and tone so AI outputs stay consistent across captions, replies and automations.",
        bullets: ["Brand profile settings", "Tone consistency", "Reusable context", "Workspace-specific voice"],
        accent: THEME.coral,
    },
    {
        icon: Workflow,
        title: "Visual automation canvas",
        description: "Build trigger/action flows with a node-based editor and start from templates, then customize the logic for your account.",
        bullets: ["Comment triggers", "Message triggers", "Delay steps", "Reply + DM actions"],
        accent: THEME.coral,
    },
    {
        icon: ShieldCheck,
        title: "Meta-connected workflows",
        description: "Instagram and Facebook events are received through webhooks so automations can react to real comments and messages in near real-time.",
        bullets: ["Instagram webhooks", "Facebook Page webhooks", "OAuth account connect", "Workspace-scoped data"],
        accent: THEME.lime,
    },
]

const automationExamples = [
    {
        title: "Comment -> AI reply -> Send DM",
        platform: "Instagram / Facebook",
        detail: "Respond publicly, then send a DM with a follow-up message or link.",
        badges: ["Canvas", "AI", "DM"],
    },
    {
        title: "New message -> AI auto reply",
        platform: "Instagram / Facebook",
        detail: "Handle common inbound DMs automatically and keep the inbox moving.",
        badges: ["Messages", "AI", "Templates"],
    },
    {
        title: "Comment -> Delay -> next action",
        platform: "Instagram / Facebook",
        detail: "Schedule a delayed continuation using the built-in scheduler (no duplicate cron jobs needed).",
        badges: ["Delay", "Scheduler", "Multi-step"],
    },
    {
        title: "Comment moderation + response",
        platform: "Instagram / Facebook",
        detail: "Reply to comments and manage hidden comments with platform-specific handling.",
        badges: ["Comments", "Moderation", "Cross-platform"],
    },
]

const marqueeItems = [
    "AI caption generation",
    "Brand profile voice context",
    "Instagram + Facebook publishing",
    "Unified inbox",
    "Comment & DM automations",
    "Visual workflow canvas",
    "Delay node + scheduler",
    "Analytics dashboard",
    "Automation templates",
]

const faqItems = [
    {
        q: "Which platforms are supported right now?",
        a: "SocialAI supports Instagram and Facebook workflows for publishing, inbox management, analytics, and core automation triggers/actions such as comments and messages.",
    },
    {
        q: "Do automations use real webhooks or polling?",
        a: "Core comment and message automations are webhook-driven through Meta events. Delay steps and scheduled posts are resumed by a unified scheduler tick so you do not need multiple cron jobs.",
    },
    {
        q: "Why do some analytics metrics show as partial?",
        a: "Meta does not always return every metric for every post type or endpoint. SocialAI shows platform-aware partial states so you can distinguish missing data from actual zero performance.",
    },
    {
        q: "How does Brand Profile help AI outputs?",
        a: "Brand Profile stores your business context and voice preferences so generated captions and AI replies stay more consistent across posts, messages, and automations in the same workspace.",
    },
    {
        q: "Do I need separate logins for Instagram and Facebook?",
        a: "Instagram Business accounts are connected through Facebook Pages in the Meta flow. Connect your pages and any linked Instagram business accounts can be used inside the app.",
    },
    {
        q: "Is there a free plan?",
        a: "Yes. There is a free starting tier, and a Pro plan page is available with expanded limits/features coming next. You can start from the free flow and upgrade later.",
    },
]

/* ─────────────────────────────────
   Animated floating orb
───────────────────────────────── */
function Orb({ x, y, size, color, blur, duration }: { x: string; y: string; size: number; color: string; blur: number; duration: number }) {
    return (
        <motion.div
            className="pointer-events-none absolute rounded-full"
            style={{ left: x, top: y, width: size, height: size, background: color, filter: `blur(${blur}px)`, willChange: "transform" }}
            animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.08, 1] }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
        />
    )
}

/* ─────────────────────────────────
   Sticky Navbar
───────────────────────────────── */
function Navbar() {
    const [scrolled, setScrolled] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20)
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    return (
        <motion.nav
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
            style={{
                background: scrolled ? "rgba(11,11,15,0.82)" : "transparent",
                backdropFilter: scrolled ? "blur(20px)" : "none",
                WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
                borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent",
            }}
        >
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5 group">
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110"
                        style={{
                            background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                            boxShadow: "0 0 24px rgba(34,211,238,0.18)",
                        }}
                    >
                        <Zap className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-bold text-white tracking-tight">SocialAI</span>
                </Link>

                {/* Desktop nav links */}
                <div className="hidden md:flex items-center gap-8">
                    {[
                        { label: "Features", href: "#features" },
                        { label: "How it works", href: "#how-it-works" },
                        { label: "FAQ", href: "#faq" },
                    ].map((item) => (
                        <a
                            key={item.label}
                            href={item.href}
                            className="text-sm font-medium transition-colors duration-200"
                            style={{ color: "rgba(255,255,255,0.45)" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                        >
                            {item.label}
                        </a>
                    ))}
                    <Link
                        href="/pricing"
                        className="text-sm font-medium transition-colors duration-200"
                        style={{ color: "rgba(255,255,255,0.45)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                    >
                        Pricing
                    </Link>
                </div>

                {/* CTA buttons */}
                <div className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="hidden md:inline-flex items-center text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200"
                        style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.95)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)" }}
                        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)" }}
                    >
                        Sign In
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all duration-200 hover:opacity-90 active:scale-95"
                        style={{
                            background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                            boxShadow: "0 6px 22px rgba(34,211,238,0.18)",
                        }}
                    >
                        Get Started
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
        </motion.nav>
    )
}

/* ─────────────────────────────────
   Hero Section
───────────────────────────────── */
function HeroPill({ icon: Icon, label }: { icon: typeof Clock3; label: string }) {
    return (
        <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
            }}
        >
            <Icon className="h-3.5 w-3.5" style={{ color: THEME.cyan }} />
            {label}
        </div>
    )
}

function HeroControlBoard() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30, rotateX: 12 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
            className="relative mx-auto w-full max-w-xl"
            style={{ perspective: "1200px" }}
        >
            <div
                className="relative overflow-hidden rounded-3xl p-4 md:p-5"
                style={{
                    background: "linear-gradient(180deg, rgba(18,19,26,0.95), rgba(10,10,14,0.95))",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 30px 70px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02) inset",
                }}
            >
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(circle at 15% 10%, rgba(34,211,238,0.12), transparent 45%), radial-gradient(circle at 90% 15%, rgba(245,158,11,0.12), transparent 40%)",
                    }}
                />

                <div className="relative space-y-4">
                    <div className="grid grid-cols-[1.15fr_0.85fr] gap-3">
                        <div
                            className="rounded-2xl p-4"
                            style={{ background: THEME.panelAlt, border: `1px solid ${THEME.border}` }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                    Publish Queue
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2 w-2 rounded-full" style={{ background: THEME.lime }} />
                                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>Live</span>
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                {[
                                    { t: "IG Reel • 12:30", c: THEME.coral },
                                    { t: "FB Post • 15:00", c: THEME.cyan },
                                    { t: "Campaign CTA • 18:15", c: THEME.amber },
                                ].map((row) => (
                                    <div key={row.t} className="flex items-center gap-2.5">
                                        <div className="h-2 w-2 rounded-full" style={{ background: row.c }} />
                                        <div className="h-2.5 flex-1 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>{row.t}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            className="rounded-2xl p-4"
                            style={{ background: THEME.panelAlt, border: `1px solid ${THEME.border}` }}
                        >
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                                Inbox Pulse
                            </p>
                            <div className="space-y-2">
                                {[
                                    { icon: Instagram, label: "New DM", color: "#ec4899" },
                                    { icon: Facebook, label: "Comment reply", color: "#3b82f6" },
                                    { icon: Bot, label: "AI draft ready", color: THEME.amber },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className="flex items-center gap-2 rounded-lg px-2 py-2"
                                        style={{ background: "rgba(255,255,255,0.02)" }}
                                    >
                                        <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-[0.95fr_1.05fr] gap-3">
                        <div
                            className="rounded-2xl p-4"
                            style={{ background: THEME.panelAlt, border: `1px solid ${THEME.border}` }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                    Reach Trend
                                </p>
                                <Activity className="h-3.5 w-3.5" style={{ color: THEME.cyan }} />
                            </div>
                            <div className="flex items-end gap-1 h-16">
                                {[16, 22, 18, 30, 27, 38, 46, 41, 54].map((h, i) => (
                                    <motion.div
                                        key={`${h}-${i}`}
                                        className="flex-1 rounded-t"
                                        initial={{ height: 4 }}
                                        animate={{ height: `${h}px` }}
                                        transition={{ duration: 0.5, delay: 0.45 + i * 0.03 }}
                                        style={{
                                            background: i % 2
                                                ? "linear-gradient(180deg, rgba(245,158,11,0.9), rgba(245,158,11,0.2))"
                                                : "linear-gradient(180deg, rgba(34,211,238,0.9), rgba(34,211,238,0.2))",
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div
                            className="rounded-2xl p-4"
                            style={{ background: THEME.panelAlt, border: `1px solid ${THEME.border}` }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                    Automation Flow
                                </p>
                                <div className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                                    Active
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                {[
                                    { icon: MessageSquare, name: "New Comment", accent: THEME.cyan },
                                    { icon: Sparkles, name: "AI Response", accent: THEME.amber },
                                    { icon: Send, name: "Send DM", accent: THEME.coral },
                                ].map((node, i) => (
                                    <div key={node.name} className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${node.accent}18`, border: `1px solid ${node.accent}33` }}>
                                            <node.icon className="h-4 w-4" style={{ color: node.accent }} />
                                        </div>
                                        <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.82)" }}>{node.name}</span>
                                        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                                        {i < 2 && <ArrowRight className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.28)" }} />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div
                        className="rounded-2xl p-4"
                        style={{ background: THEME.panelAlt, border: `1px solid ${THEME.border}` }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                                    style={{ background: `${THEME.coral}18`, border: `1px solid ${THEME.coral}33` }}
                                >
                                    <ShieldCheck className="h-4 w-4" style={{ color: THEME.coral }} />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                        Brand Profile
                                    </p>
                                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                                        Workspace voice context for AI + automations
                                    </p>
                                </div>
                            </div>
                            <span
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold"
                                style={{ background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.2)", color: "rgba(255,255,255,0.78)" }}
                            >
                                Active
                            </span>
                        </div>

                        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-3">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-20 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>Tone</span>
                                    <span style={{ color: "rgba(255,255,255,0.82)" }}>Clear, practical, no hype</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-20 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>Audience</span>
                                    <span style={{ color: "rgba(255,255,255,0.82)" }}>Creators + small brands</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-20 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>CTA style</span>
                                    <span style={{ color: "rgba(255,255,255,0.82)" }}>Direct, concise, action-first</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap content-start gap-2">
                                {["Brand voice", "AI captions", "AI replies", "Automation prompts"].map((tag, i) => (
                                    <span
                                        key={tag}
                                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                                        style={{
                                            background: i % 2 ? "rgba(34,211,238,0.08)" : "rgba(245,158,11,0.08)",
                                            border: i % 2 ? "1px solid rgba(34,211,238,0.18)" : "1px solid rgba(245,158,11,0.18)",
                                            color: "rgba(255,255,255,0.75)",
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function Hero() {
    const containerRef = useRef(null)
    const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] })
    const y = useTransform(scrollYProgress, [0, 1], [0, 180])
    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
    const scale = useTransform(scrollYProgress, [0, 1], [1, 0.95])

    return (
        <section
            ref={containerRef}
            className="relative min-h-screen flex items-center overflow-hidden"
            style={{ background: THEME.bg }}
        >
            {/* Ambient orbs */}
            <div className="pointer-events-none absolute inset-0">
                <Orb x="-10%" y="10%" size={600} color="radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)" blur={80} duration={8} />
                <Orb x="55%" y="2%" size={520} color="radial-gradient(circle, rgba(34,211,238,0.22) 0%, transparent 70%)" blur={90} duration={10} />
                <Orb x="16%" y="62%" size={420} color="radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)" blur={70} duration={12} />
            </div>

            {/* Dot grid */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.022]"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />

            {/* Horizontal grid lines */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {[20, 40, 60, 80].map((pct) => (
                    <div
                        key={pct}
                        className="absolute left-0 right-0 h-px"
                        style={{ top: `${pct}%`, background: `rgba(255,255,255,0.025)` }}
                    />
                ))}
            </div>

            <motion.div style={{ y, opacity, scale }} className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-28 pb-20">
                <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.45, ease: "backOut" }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] mb-7"
                            style={{
                                background: "rgba(34,211,238,0.08)",
                                border: "1px solid rgba(34,211,238,0.2)",
                                color: "rgba(255,255,255,0.78)",
                            }}
                        >
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: THEME.cyan }} />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: THEME.cyan }} />
                            </span>
                            Social Ops Command Center
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 32 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.75, delay: 0.08, ease: EASE }}
                            className="text-5xl md:text-7xl lg:text-[5.2rem] font-black tracking-tight leading-[0.98] mb-6"
                            style={{ color: THEME.text }}
                        >
                            Create,
                            <span className="block">schedule, reply,</span>
                            <span
                                className="block"
                                style={{
                                    background: "linear-gradient(95deg, #f59e0b 0%, #fb7185 45%, #22d3ee 100%)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    backgroundClip: "text",
                                }}
                            >
                                automate.
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.65, delay: 0.2, ease: EASE }}
                            className="text-base md:text-lg leading-relaxed mb-8 max-w-xl"
                            style={{ color: THEME.textMuted }}
                        >
                            SocialAI gives creators and brands one place to run publishing, conversations, analytics and automations without bouncing between tabs all day.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.32, ease: EASE }}
                            className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-7"
                        >
                            <Link
                                href="/login"
                                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.99]"
                                style={{
                                    background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                                    boxShadow: "0 10px 40px rgba(34,211,238,0.12), 0 1px 0 rgba(255,255,255,0.12) inset",
                                }}
                            >
                                Start for Free
                                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                            </Link>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-medium transition-all duration-200"
                                style={{
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    color: "rgba(255,255,255,0.75)",
                                }}
                            >
                                Sign In
                            </Link>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.4, ease: EASE }}
                            className="flex flex-wrap gap-2.5"
                        >
                            <HeroPill icon={Clock3} label="Schedule in minutes" />
                            <HeroPill icon={Bot} label="AI responses built-in" />
                            <HeroPill icon={MessageSquare} label="IG + FB inbox" />
                        </motion.div>
                    </div>

                    <HeroControlBoard />
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.0, duration: 0.7 }}
                    className="mt-10 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "rgba(255,255,255,0.22)" }}
                >
                    <span>Scroll</span>
                    <motion.div
                        animate={{ x: [0, 6, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                    </motion.div>
                </motion.div>
            </motion.div>
        </section>
    )
}

function MarqueeStrip() {
    const baseTrack = Array.from({ length: 4 }, () => marqueeItems).flat()
    const track = [...baseTrack, ...baseTrack]
    return (
        <section
            className="relative overflow-hidden py-6"
            style={{
                background: THEME.bgSoft,
                borderTop: "1px solid rgba(255,255,255,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
        >
            <div
                className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10"
                style={{ background: "linear-gradient(90deg, rgba(17,17,24,1), rgba(17,17,24,0))" }}
            />
            <div
                className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10"
                style={{ background: "linear-gradient(270deg, rgba(17,17,24,1), rgba(17,17,24,0))" }}
            />
            <motion.div
                className="flex items-center gap-4 w-max pr-4"
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 58, ease: "linear", repeat: Infinity }}
            >
                {track.map((item, idx) => (
                    <div key={`${item}-${idx}`} className="flex items-center gap-4 px-2">
                        <span
                            className="rounded-full px-4 py-2 text-sm md:text-[15px] font-bold whitespace-nowrap tracking-[0.01em]"
                            style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                color: "rgba(255,255,255,0.82)",
                                boxShadow: "0 8px 24px rgba(0,0,0,0.16) inset, 0 1px 0 rgba(255,255,255,0.03)",
                            }}
                        >
                            {item}
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: idx % 2 ? THEME.cyan : THEME.amber }} />
                    </div>
                ))}
            </motion.div>
        </section>
    )
}

/* ─────────────────────────────────
   Features Section
───────────────────────────────── */
function Features() {
    return (
        <section id="features" className="relative py-28 overflow-hidden" style={{ background: THEME.bgSoft }}>
            {/* Section glow */}
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.25), rgba(245,158,11,0.25), transparent)" }}
            />
            <div
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                    background:
                        "radial-gradient(circle at 10% 20%, rgba(34,211,238,0.07), transparent 40%), radial-gradient(circle at 90% 20%, rgba(245,158,11,0.06), transparent 35%)",
                }}
            />

            <div className="mx-auto max-w-7xl px-6">
                <Reveal className="text-center mb-20">
                    <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: THEME.cyan }}>
                        Everything you need
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: THEME.text }}>
                        Built for serious creators
                    </h2>
                    <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed" style={{ color: THEME.textMuted }}>
                        Not another generic “AI marketing tool.” This is an execution workspace for publishing, conversations and automation.
                    </p>
                </Reveal>

                <motion.div
                    className="grid md:grid-cols-2 lg:grid-cols-6 gap-5"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    variants={stagger}
                >
                    {features.map((f, i) => {
                        const Icon = f.icon
                        const spanClass =
                            i === 0
                                ? "md:col-span-2 lg:col-span-3"
                                : i === 1
                                    ? "lg:col-span-3"
                                    : "lg:col-span-2"
                        return (
                            <motion.div
                                key={f.title}
                                variants={fadeUp}
                                custom={i * 0.05}
                                className={`group relative rounded-2xl p-6 flex flex-col gap-4 cursor-default transition-all duration-300 hover:-translate-y-1.5 ${spanClass}`}
                                style={{
                                    background: THEME.panel,
                                    border: `1px solid rgba(255,255,255,0.07)`,
                                    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.border = `1px solid ${f.border}`
                                        ; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 40px ${f.glow}, 0 2px 20px rgba(0,0,0,0.4)`
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.07)"
                                        ; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 20px rgba(0,0,0,0.3)"
                                }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div
                                        className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                                        style={{ background: `${f.accent}18` }}
                                    >
                                        <Icon className="h-6 w-6" style={{ color: f.accent }} />
                                    </div>
                                    <div
                                        className="h-1.5 w-16 rounded-full"
                                        style={{ background: `linear-gradient(90deg, ${f.accent}, transparent)` }}
                                    />
                                </div>

                                <div className="flex-1">
                                    <h3 className="font-bold text-base mb-2" style={{ color: THEME.text }}>
                                        {f.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed" style={{ color: THEME.textMuted }}>
                                        {f.description}
                                    </p>
                                </div>

                                {/* Subtle corner accent */}
                                <div
                                    className="pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    style={{
                                        background: `radial-gradient(circle at top right, ${f.glow} 0%, transparent 70%)`,
                                    }}
                                />
                            </motion.div>
                        )
                    })}
                </motion.div>
            </div>
        </section>
    )
}

function CapabilityGrid() {
    return (
        <section className="relative py-24 overflow-hidden" style={{ background: THEME.bg }}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
            />
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-start">
                    <Reveal>
                        <div className="sticky top-24">
                            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: THEME.coral }}>
                                What you actually get
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: THEME.text }}>
                                A working social ops stack, not just an AI prompt box
                            </h2>
                            <p className="mt-4 text-base leading-relaxed" style={{ color: THEME.textMuted }}>
                                SocialAI combines the repetitive parts of social media operations into one flow: create content, publish it, manage conversations, monitor results, and automate common engagement tasks.
                            </p>
                            <div className="mt-6 space-y-3">
                                {[
                                    "Instagram + Facebook publishing and inbox workflows",
                                    "Real webhook-triggered automations for comments/messages",
                                    "Analytics view with platform-aware partial-data handling",
                                    "AI-assisted drafting with brand profile context",
                                ].map((line) => (
                                    <div key={line} className="flex items-start gap-2.5">
                                        <div className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: THEME.cyan }} />
                                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>{line}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Reveal>

                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                        className="grid md:grid-cols-2 gap-4"
                    >
                        {capabilityGroups.map((group, i) => {
                            const Icon = group.icon
                            return (
                                <motion.div
                                    key={group.title}
                                    variants={fadeUp}
                                    custom={i * 0.06}
                                    className="rounded-2xl p-5"
                                    style={{
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
                                        border: "1px solid rgba(255,255,255,0.07)",
                                        boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
                                    }}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div
                                            className="flex h-10 w-10 items-center justify-center rounded-xl"
                                            style={{ background: `${group.accent}18`, border: `1px solid ${group.accent}30` }}
                                        >
                                            <Icon className="h-5 w-5" style={{ color: group.accent }} />
                                        </div>
                                        <h3 className="text-base font-bold leading-tight" style={{ color: THEME.text }}>
                                            {group.title}
                                        </h3>
                                    </div>
                                    <p className="text-sm leading-relaxed mb-4" style={{ color: THEME.textMuted }}>
                                        {group.description}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {group.bullets.map((bullet) => (
                                            <div
                                                key={bullet}
                                                className="rounded-lg px-2.5 py-2 text-xs"
                                                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.72)" }}
                                            >
                                                {bullet}
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

function AutomationPlaybook() {
    return (
        <section className="relative py-24 overflow-hidden" style={{ background: THEME.bgSoft }}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.16), rgba(251,113,133,0.16), transparent)" }}
            />
            <div className="mx-auto max-w-7xl px-6">
                <Reveal className="mb-12">
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: THEME.lime }}>
                                Automation examples
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: THEME.text }}>
                                What teams can automate today
                            </h2>
                            <p className="mt-4 max-w-3xl text-base leading-relaxed" style={{ color: THEME.textMuted }}>
                                Start from templates or build visually on the canvas. The point is to automate repetitive engagement flows, not to create a complicated system you can’t maintain.
                            </p>
                        </div>
                        <div
                            className="rounded-xl px-4 py-3 text-sm"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)" }}
                        >
                            Includes templates for comments and messages workflows
                        </div>
                    </div>
                </Reveal>

                <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                        className="space-y-4"
                    >
                        {automationExamples.map((example, i) => (
                            <motion.div
                                key={example.title}
                                variants={fadeUp}
                                custom={i * 0.05}
                                className="rounded-2xl p-5"
                                style={{ background: THEME.panel, border: "1px solid rgba(255,255,255,0.07)" }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                    <h3 className="text-lg font-bold" style={{ color: THEME.text }}>{example.title}</h3>
                                    <span
                                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold w-fit"
                                        style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", color: "rgba(255,255,255,0.8)" }}
                                    >
                                        {example.platform}
                                    </span>
                                </div>
                                <p className="text-sm leading-relaxed mb-4" style={{ color: THEME.textMuted }}>
                                    {example.detail}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {example.badges.map((badge, idx) => (
                                        <span
                                            key={badge}
                                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                            style={{
                                                background: idx % 2 ? "rgba(245,158,11,0.08)" : "rgba(251,113,133,0.08)",
                                                border: idx % 2 ? "1px solid rgba(245,158,11,0.2)" : "1px solid rgba(251,113,133,0.2)",
                                                color: "rgba(255,255,255,0.72)",
                                            }}
                                        >
                                            {badge}
                                        </span>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>

                    <Reveal>
                        <div
                            className="rounded-2xl p-5 sticky top-24"
                            style={{ background: "linear-gradient(180deg, rgba(16,17,26,0.96), rgba(10,10,14,0.96))", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                            <div className="flex items-center gap-2 mb-4">
                                <TimerReset className="h-4 w-4" style={{ color: THEME.amber }} />
                                <p className="text-sm font-semibold" style={{ color: THEME.text }}>Operational details</p>
                            </div>
                            <div className="space-y-4 text-sm">
                                <div>
                                    <p className="font-semibold mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>Platforms</p>
                                    <p style={{ color: THEME.textMuted }}>Instagram and Facebook comments/messages are supported in the core automation flows.</p>
                                </div>
                                <div>
                                    <p className="font-semibold mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>Scheduler</p>
                                    <p style={{ color: THEME.textMuted }}>Delayed automation steps and scheduled posts run from one unified scheduler tick to keep ops simple.</p>
                                </div>
                                <div>
                                    <p className="font-semibold mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>Analytics</p>
                                    <p style={{ color: THEME.textMuted }}>Analytics UI is platform-aware and clearly labels partial metric availability when Meta APIs don’t return every metric.</p>
                                </div>
                                <div>
                                    <p className="font-semibold mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>Templates</p>
                                    <p style={{ color: THEME.textMuted }}>Templates preload the canvas graph so users can configure account/post details instead of starting from a blank board.</p>
                                </div>
                                <div>
                                    <p className="font-semibold mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>Brand Profile</p>
                                    <p style={{ color: THEME.textMuted }}>Brand profile settings help keep generated captions and AI replies aligned with the business voice across the workspace.</p>
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}

/* ─────────────────────────────────
   How it Works Section
───────────────────────────────── */
function HowItWorks() {
    return (
        <section id="how-it-works" className="relative py-28 overflow-hidden" style={{ background: THEME.bg }}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,113,133,0.22), rgba(34,211,238,0.22), transparent)" }}
            />

            {/* background orb */}
            <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
                style={{
                    background: "radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 70%)",
                    filter: "blur(60px)",
                }}
            />

            <div className="mx-auto max-w-7xl px-6">
                <Reveal className="text-center mb-20">
                    <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: THEME.amber }}>
                        Simple by design
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: THEME.text }}>
                        Up and running in minutes
                    </h2>
                    <p className="mt-4 text-base max-w-xl mx-auto leading-relaxed" style={{ color: THEME.textMuted }}>
                        No complicated setup. Just connect, create, and let SocialAI handle the rest.
                    </p>
                </Reveal>

                <div className="relative">
                    {/* Connector line */}
                    <div
                        className="hidden lg:block absolute top-10 left-[16%] right-[16%] h-px"
                        style={{ background: "linear-gradient(90deg, rgba(34,211,238,0.25), rgba(245,158,11,0.25), rgba(132,204,22,0.25))" }}
                    />

                    <motion.div
                        className="grid lg:grid-cols-3 gap-10"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                    >
                        {steps.map((step, i) => (
                            <motion.div
                                key={step.n}
                                variants={fadeUp}
                                custom={i * 0.12}
                                className="flex flex-col items-center text-center gap-5"
                            >
                                {/* Step number circle */}
                                <div className="relative flex items-center justify-center">
                                    <motion.div
                                        className="h-20 w-20 rounded-full flex items-center justify-center font-black text-2xl"
                                        style={{
                                            background: `${step.accent}14`,
                                            border: `1px solid ${step.accent}40`,
                                            color: step.accent,
                                            boxShadow: `0 0 30px ${step.accent}20`,
                                        }}
                                        whileInView={{ scale: [0.7, 1.05, 1] }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.5, delay: i * 0.12 }}
                                    >
                                        {step.n}
                                    </motion.div>
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg mb-2" style={{ color: "rgba(255,255,255,0.9)" }}>
                                        {step.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.38)" }}>
                                        {step.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

/* ─────────────────────────────────
   Platform Strip
───────────────────────────────── */
function PlatformStrip() {
    return (
        <Reveal>
            <section className="py-14" style={{ background: THEME.bgSoft, borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="mx-auto max-w-7xl px-6 flex flex-col items-center gap-8">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
                        Works with
                    </p>
                    <div className="flex items-center gap-14 flex-wrap justify-center">
                        {/* Instagram */}
                        <div className="flex items-center gap-3 group rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                                style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)", boxShadow: "0 4px 20px rgba(220,39,67,0.3)" }}
                            >
                                <Instagram className="h-5 w-5 text-white" />
                            </div>
                            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Instagram</span>
                        </div>
                        {/* Facebook */}
                        <div className="flex items-center gap-3 group rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                                style={{ background: "#1877f2", boxShadow: "0 4px 20px rgba(24,119,242,0.3)" }}
                            >
                                <Facebook className="h-5 w-5 text-white" />
                            </div>
                            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Facebook</span>
                        </div>
                    </div>
                </div>
            </section>
        </Reveal>
    )
}

/* ─────────────────────────────────
   Highlight / CTA Banner
───────────────────────────────── */
function CTABanner() {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-100px" })

    return (
        <section ref={ref} className="relative py-28 overflow-hidden" style={{ background: THEME.bg }}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.2), rgba(245,158,11,0.2), transparent)" }}
            />

            {/* Animated orbs */}
            <div className="pointer-events-none absolute inset-0">
                <Orb x="10%" y="20%" size={500} color="radial-gradient(circle, rgba(245,158,11,0.16) 0%, transparent 70%)" blur={85} duration={9} />
                <Orb x="65%" y="30%" size={420} color="radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 70%)" blur={85} duration={11} />
            </div>

            <div className="relative mx-auto max-w-7xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center"
                >
                    <div>
                        <div
                            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] mb-5"
                            style={{
                                background: "rgba(251,113,133,0.06)",
                                border: "1px solid rgba(251,113,133,0.16)",
                                color: "rgba(255,255,255,0.8)",
                            }}
                        >
                            <Zap className="h-3.5 w-3.5" style={{ color: THEME.coral }} />
                            Start With A Working System
                        </div>

                        <h2
                            className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.02] mb-5"
                            style={{ color: THEME.text }}
                        >
                            Ready to grow faster
                            <span style={{ color: "rgba(255,255,255,0.55)" }}> without adding more tools?</span>
                        </h2>

                        <p
                            className="text-base md:text-lg leading-relaxed max-w-2xl mb-6"
                            style={{ color: THEME.textMuted }}
                        >
                            Use SocialAI to centralize content creation, scheduling, inbox management and automations so your team spends more time shipping content and less time coordinating it.
                        </p>

                        <div className="grid sm:grid-cols-3 gap-3">
                            {[
                                { title: "Fast setup", text: "Connect pages and start in minutes." },
                                { title: "AI + workflows", text: "Generate and automate in one flow." },
                                { title: "Built for ops", text: "Track, iterate, and keep consistency." },
                            ].map((item, idx) => (
                                <div
                                    key={item.title}
                                    className="rounded-xl p-3"
                                    style={{
                                        background: "rgba(255,255,255,0.02)",
                                        border: "1px solid rgba(255,255,255,0.06)",
                                        boxShadow: idx === 1 ? "0 0 0 1px rgba(34,211,238,0.08) inset" : "none",
                                    }}
                                >
                                    <p className="text-sm font-semibold mb-1" style={{ color: "rgba(255,255,255,0.82)" }}>
                                        {item.title}
                                    </p>
                                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                                        {item.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div
                            className="rounded-2xl p-5 relative overflow-hidden"
                            style={{
                                background: "linear-gradient(180deg, rgba(18,19,26,0.85), rgba(11,11,15,0.9))",
                                border: "1px solid rgba(255,255,255,0.07)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
                            }}
                        >
                            <div
                                className="pointer-events-none absolute inset-0"
                                style={{
                                    background: "radial-gradient(circle at 85% 15%, rgba(34,211,238,0.10), transparent 45%), radial-gradient(circle at 15% 90%, rgba(245,158,11,0.08), transparent 45%)",
                                }}
                            />
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                        Quick Start Checklist
                                    </p>
                                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>~ 5 minutes</span>
                                </div>

                                <div className="space-y-3 mb-5">
                                    {[
                                        "Connect Instagram / Facebook pages",
                                        "Load a template or build a canvas workflow",
                                        "Set brand profile and AI response tone",
                                        "Enable automation and monitor runs",
                                    ].map((item, idx) => (
                                        <div key={item} className="flex items-start gap-3">
                                            <div
                                                className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                                                style={{
                                                    background: idx < 2 ? "rgba(132,204,22,0.16)" : "rgba(34,211,238,0.12)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                }}
                                            >
                                                <Check className="h-3 w-3" style={{ color: idx < 2 ? THEME.lime : THEME.cyan }} />
                                            </div>
                                            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{item}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2 mb-5">
                                    {["Free to start", "No credit card", "Workspace-based setup"].map((item) => (
                                        <span
                                            key={item}
                                            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
                                        >
                                            {item}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Link
                                        href="/login"
                                        className="group inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.99] flex-1"
                                        style={{
                                            background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                                            boxShadow: "0 8px 28px rgba(34,211,238,0.12), 0 1px 0 rgba(255,255,255,0.12) inset",
                                        }}
                                    >
                                        Start for Free
                                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                                    </Link>
                                    <Link
                                        href="/login"
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                                        style={{
                                            background: "rgba(255,255,255,0.03)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            color: "rgba(255,255,255,0.78)",
                                        }}
                                    >
                                        Sign In
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <div
                            className="grid sm:grid-cols-2 gap-3"
                            style={{ color: "rgba(255,255,255,0.52)" }}
                        >
                            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                <p className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: "rgba(255,255,255,0.32)" }}>For creators</p>
                                <p className="text-sm leading-relaxed">Publish faster and stay responsive without living in your inbox.</p>
                            </div>
                            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                <p className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: "rgba(255,255,255,0.32)" }}>For brands</p>
                                <p className="text-sm leading-relaxed">Standardize tone, automate common replies, and keep content execution organized.</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number>(0)
    return (
        <section id="faq" className="relative py-24 overflow-hidden" style={{ background: THEME.bg }}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.16), rgba(34,211,238,0.16), transparent)" }}
            />
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-start">
                    <Reveal>
                        <div className="sticky top-24">
                            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: THEME.cyan }}>
                                FAQ
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ color: THEME.text }}>
                                Questions teams ask before they commit
                            </h2>
                            <p className="mt-4 text-base leading-relaxed" style={{ color: THEME.textMuted }}>
                                These cover the practical questions around Meta permissions, account connections, supported platforms, and what happens when APIs return partial data.
                            </p>
                            <div className="mt-6">
                                <Link
                                    href="/pricing"
                                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.82)" }}
                                >
                                    <CircleDollarSign className="h-4 w-4" style={{ color: THEME.amber }} />
                                    See pricing
                                </Link>
                            </div>
                        </div>
                    </Reveal>

                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                        className="space-y-3"
                    >
                        {faqItems.map((item, index) => {
                            const open = openIndex === index
                            return (
                                <motion.div
                                    key={item.q}
                                    variants={fadeUp}
                                    custom={index * 0.03}
                                    className="rounded-2xl overflow-hidden"
                                    style={{ background: THEME.panel, border: "1px solid rgba(255,255,255,0.07)" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenIndex(open ? -1 : index)}
                                        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left"
                                    >
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div
                                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                                style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.16)" }}
                                            >
                                                <HelpCircle className="h-4 w-4" style={{ color: THEME.cyan }} />
                                            </div>
                                            <p className="text-sm md:text-base font-semibold leading-relaxed" style={{ color: "rgba(255,255,255,0.86)" }}>
                                                {item.q}
                                            </p>
                                        </div>
                                        <ChevronDown
                                            className="h-4 w-4 mt-1 shrink-0 transition-transform duration-200"
                                            style={{ color: "rgba(255,255,255,0.38)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                                        />
                                    </button>
                                    <motion.div
                                        initial={false}
                                        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                                        transition={{ duration: 0.22, ease: "easeOut" }}
                                        className="overflow-hidden"
                                    >
                                        <div
                                            className="px-5 pb-4 pl-16 text-sm leading-relaxed"
                                            style={{ color: THEME.textMuted, borderTop: "1px solid rgba(255,255,255,0.04)" }}
                                        >
                                            <div className="pt-3">{item.a}</div>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )
                        })}
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

/* ─────────────────────────────────
   Footer
───────────────────────────────── */
function Footer() {
    return (
        <footer
            className="relative overflow-hidden px-6 pt-12 pb-8"
            style={{
                background: "linear-gradient(180deg, rgba(9,9,13,0.98), rgba(6,6,10,1))",
                borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
        >
            <div
                className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(34,211,238,0.08), transparent 70%)", filter: "blur(24px)" }}
            />
            <div className="mx-auto max-w-7xl">
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
                    <div>
                        <div className="flex items-center gap-2.5 mb-4">
                            <div
                                className="flex h-8 w-8 items-center justify-center rounded-lg"
                                style={{ background: "linear-gradient(135deg, #f59e0b, #fb7185 55%, #22d3ee)" }}
                            >
                                <Zap className="h-4 w-4 text-white" />
                            </div>
                            <span className="text-base font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                                SocialAI
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed max-w-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                            AI-assisted social media operations for publishing, conversations, analytics and automation across Instagram and Facebook.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {["AI Assistant", "Automation Canvas", "Unified Inbox", "Analytics"].map((pill, i) => (
                                <span
                                    key={pill}
                                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                    style={{
                                        background: i % 2 ? "rgba(34,211,238,0.06)" : "rgba(245,158,11,0.06)",
                                        border: "1px solid rgba(255,255,255,0.06)",
                                        color: "rgba(255,255,255,0.7)",
                                    }}
                                >
                                    {pill}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                            Product
                        </p>
                        <div className="space-y-2">
                            {[
                                { href: "#features", label: "Features" },
                                { href: "#how-it-works", label: "How it works" },
                                { href: "/pricing", label: "Pricing" },
                                { href: "/login", label: "Dashboard Login" },
                            ].map(({ href, label }) => (
                                <a
                                    key={href}
                                    href={href}
                                    className="block text-sm transition-colors duration-150"
                                    style={{ color: "rgba(255,255,255,0.48)" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.48)")}
                                >
                                    {label}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                            Company
                        </p>
                        <div className="space-y-2">
                            {[
                                { href: "/privacy", label: "Privacy" },
                                { href: "/terms", label: "Terms" },
                                { href: "/data-deletion", label: "Data Deletion" },
                                { href: "mailto:info@swiftdigital-s.com", label: "Support" },
                            ].map(({ href, label }) => (
                                <a
                                    key={href}
                                    href={href}
                                    className="block text-sm transition-colors duration-150"
                                    style={{ color: "rgba(255,255,255,0.48)" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.48)")}
                                >
                                    {label}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                            Get Started
                        </p>
                        <div
                            className="rounded-2xl p-4"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                        >
                            <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                                Open the dashboard and connect your pages to start publishing and automating.
                            </p>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                                style={{
                                    background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                                    boxShadow: "0 8px 24px rgba(34,211,238,0.12)",
                                }}
                            >
                                Open Dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </div>

                <div
                    className="mt-8 pt-4 flex flex-col md:flex-row items-center justify-between gap-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                    <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                        © 2026 SocialAI
                    </span>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                        <span>Instagram + Facebook connected workflows</span>
                        <span className="h-1 w-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
                        <span>Built for creators & brands</span>
                    </div>
                </div>
            </div>
        </footer>
    )
}

/* ─────────────────────────────────
   Root export
───────────────────────────────── */
export function LandingPage() {
    return (
        <div className="dark" style={{ background: THEME.bg, minHeight: "100vh" }}>
            <Navbar />
            <Hero />
            <MarqueeStrip />
            <CapabilityGrid />
            <Features />
            <AutomationPlaybook />
            <HowItWorks />
            <PlatformStrip />
            <FAQSection />
            <CTABanner />
            <Footer />
        </div>
    )
}
