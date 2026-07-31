import type { LucideIcon } from "lucide-react"
import {
    BarChart3,
    Bot,
    CalendarDays,
    Inbox,
    LayoutDashboard,
    MessageCircle,
    Rocket,
    Settings,
    Sparkles,
    Zap,
} from "lucide-react"

export type DashboardNavItem = {
    icon: LucideIcon
    label: string
    href: string
    description: string
}

export const workspaceNavigation: DashboardNavItem[] = [
    {
        icon: LayoutDashboard,
        label: "Overview",
        href: "/dashboard",
        description: "Workspace performance and activity",
    },
    {
        icon: CalendarDays,
        label: "Content calendar",
        href: "/dashboard/scheduled",
        description: "Drafts, schedules, and publishing",
    },
    {
        icon: Bot,
        label: "AI studio",
        href: "/dashboard/assistant",
        description: "Create and improve content",
    },
    {
        icon: BarChart3,
        label: "Analytics",
        href: "/dashboard/analytics",
        description: "Performance and audience insights",
    },
]

export const engagementNavigation: DashboardNavItem[] = [
    {
        icon: MessageCircle,
        label: "Posts & comments",
        href: "/dashboard/comments",
        description: "Content and public conversations",
    },
    {
        icon: Inbox,
        label: "Inbox",
        href: "/dashboard/messages",
        description: "Messages and story replies",
    },
    {
        icon: Zap,
        label: "Automations",
        href: "/dashboard/automation",
        description: "Build and monitor workflows",
    },
]

export const accountNavigation: DashboardNavItem[] = [
    {
        icon: Rocket,
        label: "Setup guide",
        href: "/dashboard/onboarding/instagram",
        description: "Connect and verify Instagram",
    },
    {
        icon: Sparkles,
        label: "Brand profile",
        href: "/dashboard/settings/brand",
        description: "Voice, identity, and connections",
    },
    {
        icon: Settings,
        label: "Settings",
        href: "/dashboard/settings",
        description: "Workspace and provider settings",
    },
]

const reviewHiddenHrefs = new Set([
    "/dashboard/analytics",
    "/dashboard/comments",
    "/dashboard/messages",
    "/dashboard/automation",
])

export function getVisibleNavigation(items: DashboardNavItem[], isReviewPhase1Release: boolean) {
    if (!isReviewPhase1Release) return items
    return items.filter((item) => !reviewHiddenHrefs.has(item.href))
}

export function isNavigationItemActive(pathname: string, href: string) {
    if (href === "/dashboard") return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
}
