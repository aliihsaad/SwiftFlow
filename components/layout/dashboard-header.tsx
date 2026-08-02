"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Rocket } from "lucide-react"
import { MobileNav } from "@/components/layout/mobile-nav"
import type { Workspace } from "@/types/workspace"

const routeDetails = [
    { match: "/dashboard/onboarding", title: "Setup guide", eyebrow: "Get started" },
    { match: "/dashboard/automation", title: "Automations", eyebrow: "Engage" },
    { match: "/dashboard/analytics", title: "Analytics", eyebrow: "Understand" },
    { match: "/dashboard/comments", title: "Posts & comments", eyebrow: "Engage" },
    { match: "/dashboard/messages", title: "Inbox", eyebrow: "Engage" },
    { match: "/dashboard/settings/brand", title: "Brand profile", eyebrow: "Workspace" },
    { match: "/dashboard/settings", title: "Settings", eyebrow: "Workspace" },
]

function getRouteDetail(pathname: string) {
    if (pathname === "/dashboard") return { title: "Overview", eyebrow: "Workspace" }
    return routeDetails.find((route) => pathname.startsWith(route.match)) ?? {
        title: "SwiftFlow",
        eyebrow: "Workspace",
    }
}

type DashboardHeaderProps = {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
    isReviewPhase1Release: boolean
    userInitial: string
    userEmail: string
}

export function DashboardHeader({
    activeWorkspace,
    workspaces,
    isReviewPhase1Release,
    userInitial,
    userEmail,
}: DashboardHeaderProps) {
    const pathname = usePathname()
    const route = getRouteDetail(pathname)

    return (
        <header className="sf-topbar">
            <div className="flex min-w-0 items-center gap-3">
                <div className="lg:hidden">
                    <MobileNav
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaces}
                        isReviewPhase1Release={isReviewPhase1Release}
                    />
                </div>

                <div className="min-w-0">
                    <div className="hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35 sm:flex">
                        <span>{route.eyebrow}</span>
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        <span className="max-w-36 truncate text-white/55">{activeWorkspace?.name ?? "SwiftFlow"}</span>
                    </div>
                    <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-white sm:mt-0.5 sm:text-lg">
                        {route.title}
                    </h1>
                </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Link
                    href="/dashboard/onboarding/instagram"
                    className="sf-topbar-action hidden md:inline-flex"
                >
                    <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                    Setup
                </Link>
                <div
                    className="sf-user-avatar"
                    title={userEmail}
                    aria-label={`Signed in as ${userEmail}`}
                >
                    {userInitial}
                </div>
            </div>
        </header>
    )
}
