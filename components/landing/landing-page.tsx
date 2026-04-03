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
import Image from "next/image"
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
    Calendar,
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
    Eye,
    Users,
    TrendingUp,
    Plus,
    X,
} from "lucide-react"

/* ─────────────────────────────────
   Shared animation variants
───────────────────────────────── */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const THEME = {
    bg: "#000000",
    bgSoft: "#050505",
    panel: "#0a0a0a",
    panelAlt: "#0a0a0a",
    border: "rgba(255,255,255,0.1)",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    amber: "#f59e0b",
    cyan: "#22d3ee",
    coral: "#fb7185",
    lime: "#84cc16",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
    hidden: { opacity: 0, y: 40 },
    visible: (delay = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: EASE, delay },
    }),
}

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
        a: "SwiftFlow supports Instagram and Facebook workflows for publishing, inbox management, analytics, and core automation triggers/actions such as comments and messages.",
    },
    {
        q: "Do automations use real webhooks or polling?",
        a: "Core comment and message automations are webhook-driven through Meta events. Delay steps and scheduled posts are resumed by a unified scheduler tick so you do not need multiple cron jobs.",
    },
    {
        q: "Why do some analytics metrics show as partial?",
        a: "Meta does not always return every metric for every post type or endpoint. SwiftFlow shows platform-aware partial states so you can distinguish missing data from actual zero performance.",
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

const reviewFaqItems = [
    {
        q: "What does this review build demonstrate?",
        a: "This Phase 1 build focuses on Meta account connection, AI-assisted post creation, immediate publishing, and scheduled publishing.",
    },
    {
        q: "Which platforms are included in this release?",
        a: "The review path covers Facebook Pages and linked Instagram Business accounts connected through the Meta flow.",
    },
    {
        q: "Why are inbox, analytics, and automation features not shown here?",
        a: "This review deployment intentionally narrows the product surface so the visible experience matches the permissions and flows submitted for Meta App Review.",
    },
    {
        q: "Do I need separate Instagram credentials?",
        a: "No. Instagram Business access is connected through the linked Facebook Page inside the Meta connection flow.",
    },
    {
        q: "Where can I verify privacy and data handling details?",
        a: "Use the public Privacy Policy, Terms of Service, and Data Deletion pages linked in the site footer and reviewer flow.",
    },
    {
        q: "How does AI billing work in this release?",
        a: "AI usage follows a BYOK model. Workspace owners connect their own provider key, and provider usage charges stay with that provider account rather than being bundled into the app.",
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

    // Close mobile menu on route change / resize
    useEffect(() => {
        if (mobileOpen) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = ''
        return () => { document.body.style.overflow = '' }
    }, [mobileOpen])

    const navLinks = [
        { label: "Features", href: "#phases" },
        { label: "How it works", href: "#how-it-works" },
        { label: "FAQ", href: "#faq" },
        { label: "Pricing", href: "/pricing" },
    ]

    return (
        <motion.nav
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
            style={{
                background: (scrolled || mobileOpen) ? "rgba(0,0,0,0.95)" : "transparent",
                backdropFilter: (scrolled || mobileOpen) ? "blur(20px)" : "none",
                WebkitBackdropFilter: (scrolled || mobileOpen) ? "blur(20px)" : "none",
                borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent",
            }}
        >
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5 group" onClick={() => setMobileOpen(false)}>
                    <Image
                        src="/logo.png"
                        alt="SwiftFlow Logo"
                        width={32}
                        height={32}
                        className="rounded-lg transition-all duration-300 group-hover:scale-110 shadow-[0_0_24px_rgba(34,211,238,0.18)]"
                    />
                    <span className="font-bold text-white tracking-tight">SwiftFlow</span>
                </Link>

                {/* Desktop nav links */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="text-sm font-medium transition-colors duration-200 text-white/45 hover:text-white/90"
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                {/* Right side: CTA + Hamburger */}
                <div className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="hidden md:inline-flex items-center text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 text-white/60 hover:text-white/95 border border-white/10 hover:border-white/20"
                    >
                        Sign In
                    </Link>
                    <Link
                        href="/login"
                        className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all duration-200 hover:opacity-90 active:scale-95"
                        style={{
                            background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                            boxShadow: "0 6px 22px rgba(34,211,238,0.18)",
                        }}
                    >
                        Get Started
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>

                    {/* Hamburger */}
                    <button
                        type="button"
                        className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg border border-white/10 gap-1.5 transition-colors hover:bg-white/5"
                        onClick={() => setMobileOpen(v => !v)}
                        aria-label="Toggle menu"
                    >
                        <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <motion.div
                initial={false}
                animate={{ height: mobileOpen ? 'auto' : 0, opacity: mobileOpen ? 1 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="md:hidden overflow-hidden border-t border-white/5"
            >
                <div className="px-6 py-6 space-y-1">
                    {navLinks.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="block px-4 py-3 rounded-xl text-base font-bold text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            {item.label}
                        </Link>
                    ))}
                    <div className="pt-4 border-t border-white/5 mt-4 flex flex-col gap-3">
                        <Link
                            href="/login"
                            onClick={() => setMobileOpen(false)}
                            className="block text-center py-3 rounded-xl text-sm font-bold text-white/70 border border-white/10 hover:bg-white/5 transition-colors"
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/login"
                            onClick={() => setMobileOpen(false)}
                            className="block text-center py-3 rounded-xl text-sm font-bold text-white transition-all"
                            style={{ background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)" }}
                        >
                            Get Started Free
                        </Link>
                    </div>
                </div>
            </motion.div>
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

/* ─────────────────────────────────
   Magnetic Button Component
───────────────────────────────── */
function MagneticButton({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState({ x: 0, y: 0 })

    const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
        const { clientX, clientY } = e
        const { height, width, left, top } = ref.current!.getBoundingClientRect()
        const middleX = clientX - (left + width / 2)
        const middleY = clientY - (top + height / 2)
        setPosition({ x: middleX * 0.2, y: middleY * 0.2 })
    }

    const reset = () => {
        setPosition({ x: 0, y: 0 })
    }

    const { x, y } = position
    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouse}
            onMouseLeave={reset}
            animate={{ x, y }}
            transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
            className={`relative ${className}`}
        >
            {children}
        </motion.div>
    )
}

function HeroAppWindow({ scrollYProgress }: { scrollYProgress: any }) {
    // The window scales up and becomes fully opaque as you scroll down
    const scale = useTransform(scrollYProgress, [0, 0.4], [0.85, 1])
    const opacity = useTransform(scrollYProgress, [0, 0.2], [0.5, 1])
    const rotateX = useTransform(scrollYProgress, [0, 0.4], [15, 0])
    const y = useTransform(scrollYProgress, [0, 0.4], [200, 0])

    return (
        <motion.div
            style={{ scale, opacity, rotateX, y, transformStyle: "preserve-3d", perspective: "1000px" }}
            className="w-full max-w-6xl mx-auto rounded-xl border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(34,211,238,0.2)] mt-12 relative z-20 hidden md:block"
        >
            {/* Window Header */}
            <div className="h-12 bg-[#1a1b26] border-b border-white/5 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="mx-auto flex items-center gap-2 bg-black/40 px-3 py-1 rounded-md border border-white/5">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span className="text-xs text-white/50">Dashboard · Workspace</span>
                </div>
            </div>

            {/* Window Body - Fake App UI */}
            <div className="bg-[#0f111a] w-full aspect-21/9 flex relative overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 border-r border-white/5 p-6 space-y-6">
                    {/* Fake Profile */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-cyan-400 to-fuchsia-500 p-0.5">
                            <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-sm">SF</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="h-2.5 w-20 bg-white/20 rounded-full mb-2" />
                            <div className="h-2 w-12 bg-white/10 rounded-full" />
                        </div>
                    </div>

                    {/* Fake nav items */}
                    <div className="space-y-3 pt-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                                <div className="w-4 h-4 rounded-sm bg-white/20" />
                                <div className="h-2 w-24 bg-white/10 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-8">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <div className="h-6 w-48 bg-white/20 rounded-full mb-3" />
                            <div className="h-3 w-64 bg-white/10 rounded-full" />
                        </div>
                        <div className="h-10 w-32 rounded-lg bg-linear-to-r from-cyan-400 to-blue-500" />
                    </div>

                    <div className="grid grid-cols-3 gap-6 mb-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 rounded-xl bg-white/5 border border-white/5 p-4 flex flex-col justify-between">
                                <div className="w-8 h-8 rounded-lg bg-white/10" />
                                <div>
                                    <div className="h-4 w-16 bg-white/20 rounded-full mb-2" />
                                    <div className="h-2 w-24 bg-white/10 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-64 rounded-xl bg-white/5 border border-white/5 p-6 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at top right, #22d3ee, transparent 50%)" }} />
                        <div className="h-4 w-32 bg-white/20 rounded-full mb-8 relative z-10" />
                        <div className="flex items-end gap-4 h-32 relative z-10">
                            {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
                                <div key={i} className="flex-1 bg-linear-to-t from-cyan-500/50 to-cyan-400/80 rounded-t-sm" style={{ height: `${h}%` }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function Hero({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    const containerRef = useRef<HTMLElement>(null)
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end start"]
    })

    const titleY = useTransform(scrollYProgress, [0, 0.5], [0, -150])
    const titleOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0])

    return (
        <section ref={containerRef} className="relative w-full h-[180vh] bg-black">
            {/* Massive Aurora Background */}
            <div className="sticky top-0 w-full h-screen overflow-hidden flex flex-col items-center justify-start pt-32">

                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-cyan-500/20 blur-[120px]" />
                    <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-fuchsia-600/20 blur-[120px]" />
                    <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] rounded-full bg-amber-500/10 blur-[100px]" />
                    <div className="absolute inset-0 bg-[#0b0b0f]/60" />
                    {/* Grid Pattern */}
                    <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)",
                            backgroundSize: "32px 32px",
                        }}
                    />
                </div>

                <motion.div
                    style={{ y: titleY, opacity: titleOpacity }}
                    className="relative z-10 flex flex-col items-center text-center px-6"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, ease: EASE }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-[0.2em] mb-8"
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.9)",
                            backdropFilter: "blur(10px)"
                        }}
                    >
                        <span className="relative flex h-2 w-2 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70 bg-cyan-400" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                        </span>
                        SwiftFlow Command Center
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
                        className="text-4xl sm:text-6xl md:text-8xl lg:text-[7.5rem] font-black tracking-tighter leading-[0.9] mb-8 text-white drop-shadow-2xl"
                    >
                        Connect. Publish. <br />
                        <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-fuchsia-500 to-amber-400">
                            Review.
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
                        className="text-base md:text-2xl text-white/50 max-w-2xl font-medium mb-8 md:mb-12 px-2 md:px-0"
                    >
                        {reviewPhase1Release
                            ? "A review-safe SwiftFlow release focused on Meta account connection, AI-assisted post creation, immediate publishing, and scheduled publishing."
                            : (
                                <>
                                    The ultimate execution workspace for modern creators. <br className="hidden md:block" />
                                    Stop bouncing between tabs. Start scaling your brand.
                                </>
                            )}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
                        className="flex flex-col sm:flex-row items-center gap-3"
                    >
                        <MagneticButton>
                            <Link
                                href="/login"
                                className="group inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-bold text-black bg-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                            >
                                Start for Free
                                <ArrowRight className="h-4 sm:h-5 w-4 sm:w-5 transition-transform duration-300 group-hover:translate-x-1" />
                            </Link>
                        </MagneticButton>
                        <Link
                            href="#phases"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white/60 hover:text-white transition-colors border border-white/10 hover:border-white/20"
                        >
                            See Features
                        </Link>
                    </motion.div>
                </motion.div>

                <HeroAppWindow scrollYProgress={scrollYProgress} />
            </div>
        </section>
    )
}

/* ─────────────────────────────────
   Feature Showcase (Sticky Scrolljacking)
───────────────────────────────── */

function FakeAIWorkspace() {
    return (
        <div className="w-full h-full bg-[#0a0a0c] rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-2xl relative z-10 pointer-events-auto">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-fuchsia-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-white/1 backdrop-blur-xl relative z-20">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-fuchsia-500/20 to-purple-500/20 border border-fuchsia-500/30 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                    </div>
                    <span className="text-white/90 text-sm font-medium">AI Copilot</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                    <span className="text-white/50 text-xs">Connected</span>
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-6 relative z-10">
                <div className="flex justify-end w-full">
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} className="max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-tr-sm p-4 text-sm text-white/90 font-light shadow-lg backdrop-blur-sm">
                        Suggest 3 new content angles.
                    </motion.div>
                </div>
                <div className="flex justify-start w-full gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/5 flex items-center justify-center shrink-0 mt-1 shadow-inner">
                        <Sparkles className="w-3.5 h-3.5 text-white/80" />
                    </div>
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="max-w-[85%] flex-1 pt-1.5">
                        <p className="text-white/80 text-sm leading-relaxed font-light mb-4 text-balance">
                            Here are three high-converting content angles:
                        </p>
                        <div className="space-y-2.5">
                            {[
                                { title: "Behind the Scenes", desc: "Show your setup." },
                                { title: "Value Breakdown", desc: "Step-by-step." },
                                { title: "Transformation", desc: "Before & after." }
                            ].map((idea, i) => (
                                <div key={i} className="bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors group">
                                    <div className="text-white/90 text-xs font-medium mb-1 group-hover:text-fuchsia-300 transition-colors">{idea.title}</div>
                                    <div className="text-white/50 text-[11px] font-light">{idea.desc}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
            <div className="p-4 relative z-20">
                <div className="h-12 w-full bg-white/5 border border-white/10 rounded-xl flex items-center px-4 justify-between backdrop-blur-md shadow-inner">
                    <span className="text-white/30 text-sm font-light">Ask anything...</span>
                    <div className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer">
                        <ArrowRight className="w-3.5 h-3.5 text-white/70" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function FakePostsList() {
    return (
        <div className="w-full h-full bg-[#0a0a0c] rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-2xl relative z-10 pointer-events-auto">
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none z-0" />
            <div className="px-6 pt-6 pb-0 border-b border-white/5 bg-white/1 backdrop-blur-xl relative z-20 space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-white/90 font-medium text-sm">Content Pipeline</h3>
                    <button className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-xs font-medium hover:bg-white/20 transition-all flex items-center gap-1.5 shadow-sm">
                        <Plus className="w-3.5 h-3.5" /> Create
                    </button>
                </div>
                <div className="flex gap-6 pb-4">
                    <div className="relative text-white/90 font-medium text-xs flex items-center gap-2 cursor-pointer">
                        Scheduled
                        <span className="bg-white/10 text-white/80 py-0.5 px-1.5 rounded-md text-[10px]">3</span>
                        <div className="absolute -bottom-4 left-0 right-0 h-[2px] bg-white rounded-t-full shadow-[0_-2px_8px_rgba(255,255,255,0.5)]" />
                    </div>
                    <div className="text-white/40 font-medium text-xs hover:text-white/60 transition-colors cursor-pointer">Drafts</div>
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-3 relative z-10">
                {[
                    { title: "Weekly Resource Roundup", date: "Tomorrow, 10:00 AM", plat: "Instagram", icon: Instagram, color: "text-fuchsia-400" },
                    { title: "Founders Q&A Highlights", date: "Friday, 02:30 PM", plat: "LinkedIn", icon: Activity, color: "text-blue-400" },
                    { title: "UI Deep-Dive Carousel", date: "Monday, 11:15 AM", plat: "Instagram", icon: Instagram, color: "text-fuchsia-400" },
                ].map((post, i) => (
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={i} className="bg-white/3 border border-white/5 rounded-xl p-4 flex items-center gap-4 hover:bg-white/6 transition-all cursor-pointer group shadow-sm">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
                            <post.icon className={`w-4 h-4 ${post.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-white/90 text-sm font-medium truncate group-hover:text-white transition-colors">{post.title}</h4>
                            <p className="text-white/40 text-[11px] mt-0.5 font-light truncate">{post.date}</p>
                        </div>
                        <div className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium hidden sm:block">
                            Ready
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

function FakeAutomationFlow() {
    return (
        <div className="w-full h-full bg-[#0a0a0c] rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl pointer-events-auto">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundPosition: 'center' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />

            <div className="absolute top-6 left-6 right-6 h-12 bg-white/2 backdrop-blur-xl border border-white/10 rounded-xl flex items-center px-4 justify-between z-20 shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Bot className="w-4 h-4" />
                    </div>
                    <span className="text-white/90 text-sm font-medium">Auto-DM Flow</span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 text-[10px] font-medium">Live</span>
                </div>
            </div>

            <div className="absolute inset-0 flex flex-col justify-center items-center pt-16 group">
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
                    <motion.path
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        d="M 50% 30% L 50% 50%" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none"
                    />
                    <motion.path
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
                        d="M 50% 50% L 50% 70%" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none"
                    />
                </svg>

                <div className="flex flex-col items-center justify-between h-[60%] w-full relative z-10">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} className="w-64 bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-xl shadow-lg hover:border-white/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-fuchsia-500/20 flex items-center justify-center border border-fuchsia-500/30">
                                <Instagram className="w-4 h-4 text-fuchsia-400" />
                            </div>
                            <div>
                                <div className="text-white/90 text-sm font-medium">New Comment</div>
                                <div className="text-white/40 text-[10px] font-light mt-0.5">Contains word: "link"</div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="w-64 bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-xl shadow-lg hover:border-white/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/30">
                                <Activity className="w-4 h-4 text-yellow-400" />
                            </div>
                            <div>
                                <div className="text-white/90 text-sm font-medium">Check Follow Status</div>
                                <div className="text-white/40 text-[10px] font-light mt-0.5">Must be a follower</div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="w-64 bg-white/10 border border-white/20 rounded-xl p-4 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:bg-white/15 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                <Send className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <div className="text-white/90 text-sm font-medium">Send Direct Message</div>
                                <div className="text-white/40 text-[10px] font-light mt-0.5">"Hey! Here is the link..."</div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

function FakeAnalyticsBoard() {
    return (
        <div className="w-full h-full bg-[#0a0a0c] rounded-2xl border border-white/5 p-6 flex flex-col relative overflow-hidden shadow-2xl pointer-events-auto">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none z-0" />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 relative z-10">
                <div>
                    <h4 className="text-white/90 font-medium text-lg">Performance</h4>
                    <p className="text-white/40 text-xs font-light mt-1">Last 30 days vs previous period</p>
                </div>
                <button className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Oct 1 - Oct 31
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                {[
                    { label: "Total Reach", val: "2.4M", trend: "+14.2%", icon: Eye, positive: true },
                    { label: "Total Engagement", val: "142K", trend: "+8.4%", icon: Activity, positive: true },
                    { label: "Followers", val: "12.5K", trend: "+24.1%", icon: Users, positive: true },
                    { label: "Avg. Daily", val: "4.8K", trend: "+3.1%", icon: BarChart3, positive: true },
                ].map((stat, i) => {
                    const Icon = stat.icon
                    return (
                        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={stat.label} className="p-4 rounded-xl bg-white/2 border border-white/5 hover:bg-white/4 transition-colors shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div className="text-white/50 text-xs font-medium">{stat.label}</div>
                                <Icon className="w-4 h-4 text-white/30" />
                            </div>
                            <div className="text-2xl font-semibold text-white/90 mb-2 tabular-nums">{stat.val}</div>
                            <div className="flex items-center gap-1.5">
                                <TrendingUp className={`w-3.5 h-3.5 ${stat.positive ? 'text-emerald-400' : 'text-rose-400 rotate-180 scale-x-[-1]'}`} />
                                <span className={`text-[11px] font-medium ${stat.positive ? 'text-emerald-400' : 'text-rose-400'}`}>{stat.trend}</span>
                            </div>
                        </motion.div>
                    )
                })}
            </div>

            <div className="bg-white/1 border border-white/5 rounded-xl p-5 relative z-10">
                <div className="text-white/80 text-sm font-medium mb-3">Audience Growth</div>
                <div className="relative h-[120px] w-full">
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(59, 130, 246, 0.2)" />
                                <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                            </linearGradient>
                        </defs>
                        <path d="M 0 25 L 100 25 M 0 50 L 100 50 M 0 75 L 100 75" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" fill="none" vectorEffect="non-scaling-stroke" />
                        <path d="M 0 80 Q 20 75, 40 50 T 70 30 T 100 10 L 100 100 L 0 100 Z" fill="url(#chart-grad)" stroke="none" />
                        <motion.path initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.5, ease: "easeInOut" }} d="M 0 80 Q 20 75, 40 50 T 70 30 T 100 10" fill="none" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    </svg>
                </div>
            </div>
        </div>
    )
}

function FakeBrandProfile() {
    return (
        <div className="w-full h-full bg-[#0a0a0c] rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-2xl relative z-10 pointer-events-auto">
            <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-white/1 backdrop-blur-xl shrink-0 relative z-20">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-purple-500 p-px">
                        <div className="w-full h-full bg-[#0a0a0c] rounded-[7px] flex items-center justify-center">
                            <span className="text-white/90 text-[10px] font-bold">SF</span>
                        </div>
                    </div>
                    <span className="text-white/90 font-medium text-sm">SwiftFlow Identity</span>
                </div>
                <div className="px-3 py-1.5 bg-white/10 rounded-lg text-white/80 text-xs font-medium flex items-center gap-1.5 shadow-sm">
                    <Check className="w-3.5 h-3.5" /> Saved
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-500/10 blur-[100px] rounded-full pointer-events-none z-0" />

                <div className="flex-1 p-6 space-y-6 overflow-y-auto relative z-10 max-w-2xl mx-auto w-full">
                    <div className="bg-white/2 border border-white/5 rounded-xl p-6 shadow-sm">
                        <h3 className="text-white/90 text-sm font-medium mb-1">Brand Guidelines</h3>
                        <p className="text-white/40 text-xs font-light mb-6">Set the boundaries for how the AI should sound.</p>

                        <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-white/60 text-xs font-medium">Primary Voice</label>
                                    <div className="h-10 border border-white/10 bg-white/5 rounded-lg px-4 flex items-center justify-between text-white/80 text-sm font-light hover:border-white/20 transition-colors cursor-pointer">
                                        Authoritative & Clean
                                        <ChevronDown className="w-4 h-4 text-white/40" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-white/60 text-xs font-medium">Language</label>
                                    <div className="h-10 border border-white/10 bg-white/5 rounded-lg px-4 flex items-center justify-between text-white/80 text-sm font-light hover:border-white/20 transition-colors cursor-pointer">
                                        English (US)
                                        <ChevronDown className="w-4 h-4 text-white/40" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-white/60 text-xs font-medium">Target Audience Persona</label>
                                <div className="min-h-[80px] border border-white/10 bg-white/5 rounded-lg p-4 text-white/80 text-sm font-light leading-relaxed hover:border-white/20 transition-colors">
                                    Creators and startup founders scaling social media via AI automation. They value aesthetics, speed, and premium experiences.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/2 border border-white/5 rounded-xl p-6 shadow-sm">
                            <h3 className="text-white/90 text-sm font-medium mb-4">Core Services</h3>
                            <div className="flex flex-wrap gap-2">
                                {["Content Gen", "Scheduling", "Analytics"].map((service) => (
                                    <div key={service} className="px-3 py-1.5 border border-white/10 bg-white/5 rounded-lg flex items-center gap-2 text-white/70 text-xs font-medium">
                                        {service}
                                        <X className="w-3 h-3 text-white/30 hover:text-white/80 cursor-pointer transition-colors" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white/2 border border-white/5 rounded-xl p-6 shadow-sm">
                            <h3 className="text-white/90 text-sm font-medium mb-4">Key Value Props</h3>
                            <div className="flex flex-wrap gap-2">
                                {["Saves 10+ hrs", "On-Brand AI"].map((usp) => (
                                    <div key={usp} className="px-3 py-1.5 border border-indigo-500/30 bg-indigo-500/10 rounded-lg flex items-center gap-2 text-indigo-300 text-xs font-medium">
                                        {usp}
                                        <X className="w-3 h-3 text-indigo-300/50 hover:text-indigo-300 cursor-pointer transition-colors" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

const SHOWCASE_ITEMS = [
    {
        id: "brand",
        title: "Brand Profile",
        desc: "Set firm tonal guidelines and vocabulary rules to ensure the AI always sounds exactly like you.",
        ui: <FakeBrandProfile />
    },
    {
        id: "generate",
        title: "AI Chat Assistant",
        desc: "Chat with an intelligent assistant to rapidly brainstorm ideas and draft high-converting captions.",
        ui: <FakeAIWorkspace />
    },
    {
        id: "schedule",
        title: "Tabbed Scheduling",
        desc: "Organize your content effectively with clean, list-based views for scheduled posts and drafts.",
        ui: <FakePostsList />
    },
    {
        id: "automate",
        title: "Trigger Automations",
        desc: "Build comment and DM auto-replies instantly using our visual drag-and-drop workflow canvas.",
        ui: <FakeAutomationFlow />
    },
    {
        id: "analyze",
        title: "Track Performance",
        desc: "Monitor your multi-channel reach and engagement growth natively inside the dashboard.",
        ui: <FakeAnalyticsBoard />
    }
]

function FeaturePhase({
    item,
    idx,
    total,
    scrollYProgress
}: {
    item: any
    idx: number
    total: number
    scrollYProgress: any
}) {
    const step = 1 / (total - 1)
    const start = idx * step
    const end = (idx + 1) * step

    const isLast = idx === total - 1

    const clipAnim = useTransform(
        scrollYProgress,
        isLast ? [0, 1] : [start, end],
        isLast ? ["inset(0 0 0 0)", "inset(0 0 0 0)"] : ["inset(0% 0 0% 0)", "inset(0% 0 100% 0)"]
    )

    let scalePoints = []
    let scaleValues = []

    if (idx === 0) {
        scalePoints = [0, end]
        scaleValues = [1, 0.95]
    } else if (isLast) {
        scalePoints = [start - step, start]
        scaleValues = [0.9, 1]
    } else {
        scalePoints = [start - step, start, end]
        scaleValues = [0.9, 1, 0.95]
    }

    const scaleAnim = useTransform(scrollYProgress, scalePoints, scaleValues)

    return (
        <motion.div
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 lg:p-12 w-full h-full"
            style={{
                clipPath: isLast ? "inset(0 0 0 0)" : clipAnim,
                zIndex: total - idx
            }}
        >
            <motion.div
                style={{ scale: scaleAnim }}
                className="w-full h-full max-h-[600px] border border-white/10 rounded-2xl overflow-hidden shadow-2xl bg-[#0a0a0f] relative filter drop-shadow-2xl"
            >
                {item.ui}
            </motion.div>
        </motion.div>
    )
}

function FeatureShowcase() {
    const containerRef = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    })

    return (
        <section ref={containerRef} className="relative w-full bg-[#000000]">

            {/* Visuals - Sticky across Desktop & Mobile */}
            <div className="absolute inset-x-0 top-0 w-full md:w-1/2 h-full z-10 pointer-events-none">
                <div className="sticky top-0 h-[45vh] md:h-screen w-full flex items-center justify-center overflow-hidden bg-linear-to-b from-black via-black to-transparent md:bg-transparent">
                    {SHOWCASE_ITEMS.map((item, idx) => (
                        <FeaturePhase
                            key={item.id}
                            item={item}
                            idx={idx}
                            total={SHOWCASE_ITEMS.length}
                            scrollYProgress={scrollYProgress}
                        />
                    ))}
                </div>
            </div>

            {/* Huge Background Typography - Static for style */}
            <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none z-0 overflow-hidden opacity-10 mix-blend-screen">
                <h2 className="text-[12rem] font-black text-transparent whitespace-nowrap" style={{ WebkitTextStroke: "2px rgba(255,255,255,0.2)", WebkitTextFillColor: "transparent" }}>
                    SWIFTFLOW
                </h2>
            </div>

            {/* Text blocks */}
            <div className="relative w-full z-0 px-0">
                {SHOWCASE_ITEMS.map((item, idx) => (
                    <div
                        key={item.id}
                        className="h-screen w-full flex flex-col justify-end md:justify-center md:items-end pb-12 md:pb-0 px-6 sm:px-10 lg:px-20 pointer-events-auto"
                    >
                        <div className="w-full md:w-1/2 pl-0 md:pl-12 lg:pl-24">
                            <p className="text-sm font-bold uppercase tracking-[0.2em] mb-4 text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-fuchsia-500">
                                0{idx + 1} // Phase
                            </p>
                            <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 leading-[1.1] tracking-tight drop-shadow-lg">
                                {item.title}
                            </h3>
                            <p className="text-base md:text-xl text-white/50 leading-relaxed font-medium max-w-md drop-shadow">
                                {item.desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

function LandingCanvasSidebarRow({
    icon: Icon,
    label,
    color,
}: {
    icon: any
    label: string
    color: string
}) {
    return (
        <div
            className="flex items-center gap-2 p-2 rounded-lg text-sm"
            style={{ background: "#1b1d28", border: "1px solid rgba(255,255,255,0.08)" }}
        >
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}20`, color }}>
                <Icon className="h-3.5 w-3.5" />
            </div>
            <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
                {label}
            </p>
        </div>
    )
}

function LandingCanvasNodeCard({
    x,
    y,
    label,
    description,
    icon: Icon,
    headerBg,
    borderColor,
    handleColor,
    selected = false,
    topHandle = true,
}: {
    x: number
    y: number
    label: string
    description: string
    icon: any
    headerBg: string
    borderColor: string
    handleColor: string
    selected?: boolean
    topHandle?: boolean
}) {
    return (
        <div
            className="absolute rounded-xl border-2 shadow-md min-w-[180px] max-w-[220px]"
            style={{
                left: x,
                top: y,
                background: "#151620",
                borderColor,
                boxShadow: selected ? "0 10px 26px rgba(56,189,248,0.16)" : undefined,
            }}
        >
            {topHandle && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 -top-1.5 h-3 w-3 rounded-full border-2"
                    style={{ background: handleColor, borderColor: "#151620" }}
                />
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-t-[10px]" style={{ background: headerBg }}>
                <Icon className="h-4 w-4 text-white shrink-0" />
                <span className="text-sm font-medium text-white truncate">{label}</span>
            </div>
            <div className="px-3 py-2">
                <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {description}
                </p>
            </div>
            <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 h-3 w-3 rounded-full border-2"
                style={{ background: handleColor, borderColor: "#151620" }}
            />
        </div>
    )
}

function AutomationCanvasLandingMock() {
    return (
        <div
            className="rounded-[2rem] p-4 md:p-6 relative overflow-hidden group"
            style={{
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8)",
            }}
        >
            <div className="absolute inset-0 bg-linear-to-b from-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="mb-6 flex items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-4">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                        <Workflow className="h-6 w-6" />
                    </span>
                    <div>
                        <p className="text-lg font-bold text-white tracking-tight">
                            Real Canvas Preview
                        </p>
                        <p className="mt-0.5 text-xs text-white/40">
                            Actual in-app workspace capture
                        </p>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-white">
                        <Instagram className="h-4 w-4 text-rose-400" /> IG Waitlist
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-white">
                        <Facebook className="h-4 w-4 text-blue-400" /> FB Waitlist
                    </span>
                </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-white/10 relative z-10 bg-black">
                <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] pointer-events-none" />
                <img
                    src="/images/ScreenRecording2026-02-24170317-ezgif.com-video-to-gif-converter.gif"
                    alt="Automation canvas workflow preview"
                    className="block w-full h-auto opacity-90 group-hover:opacity-100 transition-opacity"
                />
            </div>
        </div>
    )
}

function AutomationPlaybook() {
    return (
        <section className="relative py-16 md:py-32 overflow-hidden bg-[#000000]">
            <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none mix-blend-screen opacity-50" />
            <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-fuchsia-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen opacity-50" />

            <div className="mx-auto max-w-7xl px-6 relative z-10">
                <Reveal className="mb-20 text-center max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6">
                        <Workflow className="w-3.5 h-3.5" /> Workflow Engine
                    </div>
                    <h2 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight text-white leading-[1.1]">
                        What scaleups can automate <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-fuchsia-500">today.</span>
                    </h2>
                    <p className="mt-8 text-lg sm:text-xl leading-relaxed text-white/50 font-medium max-w-2xl mx-auto">
                        Start from pre-tested templates or build visually on the node canvas. We stripped away the complexity so you can deploy engagement cycles in minutes, not months.
                    </p>
                </Reveal>

                <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-8 xl:gap-12 items-start">
                    <Reveal>
                        <AutomationCanvasLandingMock />
                    </Reveal>

                    <Reveal>
                        <div className="rounded-[2rem] p-8 md:p-10 sticky top-32 bg-[#0a0a0a] border border-white/10 shadow-2xl overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 blur-[80px] rounded-full pointer-events-none" />

                            <div className="flex items-center gap-3 mb-8 relative z-10">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
                                    <TimerReset className="h-6 w-6" />
                                </div>
                                <h3 className="text-2xl font-bold text-white tracking-tight">Operational Engine</h3>
                            </div>

                            <div className="space-y-8 relative z-10">
                                {[
                                    { title: "Universal Platforms", desc: "Instagram and Facebook comments/messages are perfectly synced in the core flows." },
                                    { title: "Unified Scheduler ticks", desc: "Delayed automation steps run from a single unified ticking engine to keep ops insanely simple." },
                                    { title: "Heuristic Analytics", desc: "If Meta throttles metrics, the UI immediately flags partial limits instead of crashing." },
                                    { title: "1-Click Templates", desc: "Instantly preload the canvas graph. You only configure handles and text, not logic." },
                                    { title: "Tonal Guardrails", desc: "Your workspace Brand Profile strictly forces AI replies to match your brand's unique voice." }
                                ].map((item, idx) => (
                                    <div key={idx} className="group cursor-default">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 group-hover:scale-150 transition-transform" />
                                            <p className="text-base font-bold text-white/90 group-hover:text-white transition-colors">{item.title}</p>
                                        </div>
                                        <p className="text-sm text-white/40 leading-relaxed group-hover:text-white/60 transition-colors pl-4.5 border-l border-white/5 ml-[3px]">
                                            {item.desc}
                                        </p>
                                    </div>
                                ))}
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
function HowItWorks({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    return (
        <section id="how-it-works" className="relative py-16 md:py-32 overflow-hidden bg-black">
            {/* Background elements */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-px bg-linear-to-r from-transparent via-fuchsia-500/50 to-transparent" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-fuchsia-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="mx-auto max-w-7xl px-6 relative z-10">
                <Reveal className="text-center mb-24">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-bold uppercase tracking-widest mb-6">
                        Rapid Onboarding
                    </div>
                    <h2 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight text-white mb-6">
                        Up and running in <span className="text-transparent bg-clip-text bg-linear-to-r from-fuchsia-500 to-amber-500">minutes.</span>
                    </h2>
                    <p className="mt-4 text-base md:text-xl max-w-2xl mx-auto leading-relaxed text-white/50 font-medium">
                        {reviewPhase1Release
                            ? "Connect your accounts, create content with AI assistance, and publish from one clean workspace."
                            : "No massive migration plans. Just connect your accounts, setup your brand voice, and let SwiftFlow take the wheel."}
                    </p>
                </Reveal>

                <div className="relative">
                    {/* Connector line */}
                    <div className="hidden lg:block absolute top-12 left-[16%] right-[16%] h-px bg-linear-to-r from-cyan-500/0 via-cyan-500/50 to-fuchsia-500/0" />

                    <motion.div
                        className="grid lg:grid-cols-3 gap-12"
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
                                className="flex flex-col items-center text-center gap-6 relative group"
                            >
                                {/* Step number circle */}
                                <div className="relative flex items-center justify-center">
                                    <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full group-hover:bg-cyan-500/20 transition-colors duration-500" />
                                    <motion.div
                                        className="relative h-24 w-24 rounded-full flex items-center justify-center font-black text-3xl bg-[#0a0a0a] border border-white/10 text-white/80 shadow-2xl group-hover:border-cyan-500/50 group-hover:text-cyan-400 transition-colors duration-500"
                                        whileInView={{ scale: [0.8, 1.05, 1] }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.5, delay: i * 0.12 }}
                                    >
                                        {step.n}
                                    </motion.div>
                                </div>

                                <div>
                                    <h3 className="font-bold text-xl text-white mb-3">
                                        {step.title}
                                    </h3>
                                    <p className="text-base leading-relaxed max-w-xs mx-auto text-white/40 group-hover:text-white/60 transition-colors duration-500">
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
            <section className="py-20 relative bg-[#0a0a0a] border-y border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[24px_24px]" />
                <div className="mx-auto max-w-7xl px-6 flex flex-col items-center gap-10 relative z-10">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/30">
                        Natively Integrated With
                    </p>
                    <div className="flex items-center gap-8 sm:gap-16 flex-wrap justify-center">
                        {/* Instagram */}
                        <div className="flex items-center gap-4 group cursor-default">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 group-hover:border-rose-500/50 group-hover:bg-rose-500/10 transition-all duration-300">
                                <Instagram className="h-6 w-6 text-white/50 group-hover:text-rose-400 transition-colors duration-300" />
                            </div>
                            <span className="text-lg font-bold text-white/50 group-hover:text-white transition-colors duration-300">Instagram</span>
                        </div>
                        {/* Facebook */}
                        <div className="flex items-center gap-4 group cursor-default">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-all duration-300">
                                <Facebook className="h-6 w-6 text-white/50 group-hover:text-blue-400 transition-colors duration-300" />
                            </div>
                            <span className="text-lg font-bold text-white/50 group-hover:text-white transition-colors duration-300">Facebook</span>
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
function CTABanner({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-100px" })

    return (
        <section ref={ref} className="relative py-16 md:py-32 overflow-hidden bg-black">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] pointer-events-none rounded-full mix-blend-screen opacity-50" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-fuchsia-500/10 blur-[150px] pointer-events-none rounded-full mix-blend-screen opacity-50" />

            <div className="relative mx-auto max-w-7xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center"
                >
                    <div className="max-w-xl">
                        <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-8">
                            <Zap className="h-3.5 w-3.5" /> Start Executing
                        </div>

                        <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] text-white mb-8">
                            {reviewPhase1Release ? "Launch the review flow." : "Scale your impact."}<br />
                            <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-fuchsia-500">Not headcount.</span>
                        </h2>

                        <p className="text-base md:text-lg leading-relaxed text-white/50 font-medium mb-10">
                            {reviewPhase1Release
                                ? "SwiftFlow centralizes Meta account connection, AI-assisted content creation, immediate publishing, and scheduled publishing for this submission."
                                : "SwiftFlow centralizes content creation, scheduling, and Inbox automations. Spend less time copying and pasting across apps, and more time growing."}
                        </p>

                        {reviewPhase1Release && (
                            <div className="mb-8 rounded-2xl border border-cyan-300/20 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100/90">
                                <span className="font-medium">AI is BYOK:</span> teams connect their own OpenRouter, OpenAI, or Gemini key, and provider usage remains on that provider account.
                            </div>
                        )}

                        <div className="grid sm:grid-cols-2 gap-6">
                            {(reviewPhase1Release
                                ? [
                                    { title: "Fast Setup", text: "Connect Pages and linked Instagram accounts in minutes." },
                                    { title: "AI Drafting", text: "Generate captions and creative starting points inside the app." },
                                    { title: "Direct Publishing", text: "Publish immediately without leaving the workspace." },
                                    { title: "Scheduled Posts", text: "Set a publishing time and let the scheduler handle the rest." },
                                ]
                                : [
                                    { title: "Fast Setup", text: "Connect pages and start in minutes." },
                                    { title: "AI + Workflows", text: "Generate and automate in one flow." },
                                    { title: "Operational Focus", text: "Track, iterate, and maintain consistency." },
                                    { title: "Constant ROI", text: "Save hours automatically." },
                                ]).map((item, idx) => (
                                <div key={idx} className="flex gap-3 ">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)] shrink-0" />
                                    <div>
                                        <h4 className="text-white font-bold text-sm mb-1">{item.title}</h4>
                                        <p className="text-white/40 text-xs leading-relaxed">{item.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div
                            className="rounded-[2rem] p-8 md:p-10 relative overflow-hidden"
                            style={{
                                background: "#0a0a0a",
                                border: "1px solid rgba(255,255,255,0.1)",
                                boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
                            }}
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.15),transparent_45%),radial-gradient(circle_at_15%_90%,rgba(245,158,11,0.12),transparent_45%)]" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                                        Quick Start Checklist
                                    </p>
                                    <span className="text-xs font-bold text-white/50">~ 5 mins</span>
                                </div>

                                <div className="space-y-4 mb-8">
                                    {(reviewPhase1Release
                                        ? [
                                            "Connect Facebook Pages and linked Instagram business accounts",
                                            "Create a post or draft with AI assistance",
                                            "Review brand context and publishing readiness",
                                            "Publish now or schedule for later",
                                        ]
                                        : [
                                            "Connect Instagram / Facebook pages",
                                            "Load a template or build a canvas workflow",
                                            "Set brand profile and AI response tone",
                                            "Enable automation and monitor runs",
                                        ]).map((item, idx) => (
                                        <div key={item} className="flex items-start gap-4">
                                            <div
                                                className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full shrink-0"
                                                style={{
                                                    background: idx < 2 ? "rgba(34,211,238,0.1)" : "rgba(251,113,133,0.1)",
                                                    border: "1px solid " + (idx < 2 ? "rgba(34,211,238,0.2)" : "rgba(251,113,133,0.2)"),
                                                }}
                                            >
                                                <Check className="h-4 w-4" style={{ color: idx < 2 ? "#22d3ee" : "#fb7185" }} />
                                            </div>
                                            <p className="text-base font-medium text-white/80">{item}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                                    <Link
                                        href="/login"
                                        className="group inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold text-black bg-white transition-all duration-300 hover:scale-105 active:scale-95 flex-1"
                                    >
                                        Start for Free
                                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                                    </Link>
                                    <Link
                                        href="/login"
                                        className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold text-white transition-all duration-200 bg-white/5 border border-white/10 hover:bg-white/10 shrink-0"
                                    >
                                        Sign In
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="rounded-2xl p-5 bg-[#0a0a0a] border border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-rose-400">For creators</p>
                                <p className="text-sm font-medium leading-relaxed text-white/60">
                                    {reviewPhase1Release
                                        ? "Create and schedule social posts faster without leaving the workspace."
                                        : "Publish faster and stay responsive without living in your inbox."}
                                </p>
                            </div>
                            <div className="rounded-2xl p-5 bg-[#0a0a0a] border border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-cyan-400">For brands</p>
                                <p className="text-sm font-medium leading-relaxed text-white/60">
                                    {reviewPhase1Release
                                        ? "Keep Meta publishing organized with reusable brand context and cleaner execution."
                                        : "Standardize tone, automate common replies, and keep content execution organized."}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

function FAQSection({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    const [openIndex, setOpenIndex] = useState<number>(0)
    const activeFaqItems = reviewPhase1Release ? reviewFaqItems : faqItems
    return (
        <section id="faq" className="relative py-16 md:py-32 overflow-hidden bg-black">
            <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/10 blur-[120px] rounded-full pointer-events-none opacity-50 mix-blend-screen" />

            <div className="mx-auto max-w-7xl px-6 relative z-10">
                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-start">
                    <Reveal>
                        <div className="sticky top-24">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6">
                                <HelpCircle className="w-3.5 h-3.5" /> FAQ
                            </div>
                            <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
                                Answers before you commit.
                            </h2>
                            <p className="mt-6 text-base leading-relaxed text-white/50 font-medium max-w-md">
                                {reviewPhase1Release
                                    ? "Focused on the exact connection and publishing flow included in this Meta review release."
                                    : "Covering everything from API permissions, platform connections, to edge cases."}
                            </p>
                            <div className="mt-8">
                                <Link
                                    href="/pricing"
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                    <CircleDollarSign className="h-4 w-4 text-amber-500" />
                                    See pricing plans
                                </Link>
                            </div>
                        </div>
                    </Reveal>

                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                        className="space-y-4"
                    >
                        {activeFaqItems.map((item, index) => {
                            const open = openIndex === index
                            return (
                                <motion.div
                                    key={item.q}
                                    variants={fadeUp}
                                    custom={index * 0.03}
                                    className="rounded-2xl overflow-hidden bg-[#0a0a0a] border border-white/10 transition-all duration-300 hover:border-white/20"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenIndex(open ? -1 : index)}
                                        className="w-full flex items-start justify-between gap-4 px-6 py-5 text-left"
                                    >
                                        <div className="flex items-start gap-4 min-w-0">
                                            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            </div>
                                            <p className="text-base font-bold text-white/90">
                                                {item.q}
                                            </p>
                                        </div>
                                        <ChevronDown
                                            className="h-5 w-5 mt-0.5 shrink-0 transition-transform duration-300 text-white/40"
                                            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                                        />
                                    </button>
                                    <motion.div
                                        initial={false}
                                        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-6 pb-6 pl-16 text-sm leading-relaxed text-white/50 border-t border-white/5 pt-4">
                                            <div className="pt-2">{item.a}</div>
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
function Footer({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    return (
        <footer className="relative bg-black pt-20 pb-10 border-t border-white/5 overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-500/20 to-transparent" />
            <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none opacity-30 mix-blend-screen" />
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/5 blur-[100px] rounded-full pointer-events-none opacity-30 mix-blend-screen" />

            <div className="mx-auto max-w-7xl px-6 relative z-10">
                <div className="grid gap-12 lg:gap-8 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">

                    {/* Brand Column */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <Image
                                src="/logo.png"
                                alt="SwiftFlow Logo"
                                width={36}
                                height={36}
                                className="rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] border border-white/10"
                            />
                            <span className="text-xl font-bold tracking-tight text-white">
                                SwiftFlow
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed max-w-xs text-white/50 font-medium">
                            {reviewPhase1Release
                                ? "AI-assisted social publishing for Facebook and Instagram, focused on account connection, post creation, immediate publishing, and scheduled publishing."
                                : "AI-assisted social media operations for publishing, conversations, analytics and automation across Instagram and Facebook."}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-2">
                            {(reviewPhase1Release
                                ? ["AI Assistant", "Meta Connect", "Direct Publish", "Scheduling"]
                                : ["AI Assistant", "Automation Canvas", "Unified Inbox", "Analytics"]).map((pill, i) => (
                                <span
                                    key={pill}
                                    className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-white/3 border border-white/6 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                                >
                                    {pill}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Links: Product */}
                    <div className="lg:pl-8">
                        <h4 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-white/30">
                            Product
                        </h4>
                        <ul className="space-y-4">
                            {[
                                { href: "#phases", label: "Features" },
                                { href: "#how-it-works", label: "How it works" },
                                { href: "/pricing", label: "Pricing" },
                                { href: "/login", label: "Dashboard Login" },
                            ].map(({ href, label }) => (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        className="text-sm font-medium text-white/50 hover:text-white transition-colors duration-200 flex items-center gap-2 group"
                                    >
                                        <span className="w-0 h-px bg-white/50 group-hover:w-2 transition-all duration-300" />
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Links: Company */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-white/30">
                            Company
                        </h4>
                        <ul className="space-y-4">
                            {[
                                { href: "/privacy", label: "Privacy Policy" },
                                { href: "/terms", label: "Terms of Service" },
                                { href: "/data-deletion", label: "Data Deletion" },
                                { href: "mailto:info@swiftdigital-s.com", label: "Contact Support" },
                            ].map(({ href, label }) => (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        className="text-sm font-medium text-white/50 hover:text-white transition-colors duration-200 flex items-center gap-2 group"
                                    >
                                        <span className="w-0 h-px bg-white/50 group-hover:w-2 transition-all duration-300" />
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Action Block */}
                    <div className="lg:justify-self-end w-full max-w-sm">
                        <div className="rounded-[1.5rem] p-6 bg-linear-to-b from-[#111111] to-[#050505] border border-white/5 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px] group-hover:bg-cyan-500/20 transition-colors duration-500" />

                            <h4 className="text-xs font-bold uppercase tracking-[0.2em] mb-3 text-white/70 relative z-10">
                                {reviewPhase1Release ? "Start Publishing" : "Start Scaling"}
                            </h4>
                            <p className="text-sm font-medium leading-relaxed mb-6 text-white/40 relative z-10">
                                {reviewPhase1Release
                                    ? "Open the dashboard, connect your pages, and test the Phase 1 publishing flow."
                                    : "Open the dashboard and connect your pages to start publishing and automating today."}
                            </p>

                            <Link
                                href="/login"
                                className="group/btn relative flex items-center justify-between px-5 py-3 rounded-xl bg-white text-black font-bold text-sm overflow-hidden"
                            >
                                <span className="relative z-10">Open Dashboard</span>
                                <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center relative z-10 group-hover/btn:bg-black/20 transition-colors">
                                    <ArrowRight className="h-4 w-4" />
                                </div>
                                <div className="absolute inset-0 bg-linear-to-r from-white via-cyan-100 to-white opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-20 pt-8 border-t border-white/3 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <span className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">
                            © {new Date().getFullYear()} SwiftFlow
                        </span>
                    </div>

                    <div className="flex flex-wrap justify-center items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/20">
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
                            Instagram
                        </span>
                        <span className="text-white/10">+</span>
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                            Facebook
                        </span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span>Built for scale</span>
                    </div>
                </div>
            </div>
        </footer>
    )
}

/* ─────────────────────────────────
   Root export
───────────────────────────────── */
export function LandingPage({ reviewPhase1Release = false }: { reviewPhase1Release?: boolean }) {
    return (
        <div className="dark" style={{ background: THEME.bg, minHeight: "100vh" }}>
            <Navbar />
            <Hero reviewPhase1Release={reviewPhase1Release} />

            {!reviewPhase1Release && <FeatureShowcase />}
            {!reviewPhase1Release && <AutomationPlaybook />}
            <HowItWorks reviewPhase1Release={reviewPhase1Release} />
            <PlatformStrip />
            <FAQSection reviewPhase1Release={reviewPhase1Release} />
            <CTABanner reviewPhase1Release={reviewPhase1Release} />
            <Footer reviewPhase1Release={reviewPhase1Release} />
        </div>
    )
}

