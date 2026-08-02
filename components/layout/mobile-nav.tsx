"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Menu, X, Zap } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import {
    accountNavigation,
    engagementNavigation,
    getVisibleNavigation,
    isNavigationItemActive,
    type DashboardNavItem,
    workspaceNavigation,
} from "@/components/layout/dashboard-navigation"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import { cn } from "@/lib/utils"
import type { Workspace } from "@/types/workspace"

type MobileNavProps = {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
    isReviewPhase1Release: boolean
}

type MobileNavigationLinkProps = {
    item: DashboardNavItem
    pathname: string
    onNavigate: () => void
}

function MobileNavigationLink({ item, pathname, onNavigate }: MobileNavigationLinkProps) {
    const active = isNavigationItemActive(pathname, item.href)
    const Icon = item.icon

    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl border px-3.5 text-sm font-medium transition",
                active
                    ? "border-violet-300/15 bg-violet-400/[0.11] text-white"
                    : "border-transparent text-white/52 hover:border-white/[0.06] hover:bg-white/[0.045] hover:text-white",
            )}
        >
            <span
                className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border",
                    active
                        ? "border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-200"
                        : "border-white/[0.06] bg-white/[0.025] text-white/42",
                )}
            >
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>{item.label}</span>
        </Link>
    )
}

export function MobileNav({ activeWorkspace, workspaces, isReviewPhase1Release }: MobileNavProps) {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const sections = [
        {
            label: "Workspace",
            items: getVisibleNavigation(workspaceNavigation, isReviewPhase1Release),
        },
        {
            label: "Engage",
            items: getVisibleNavigation(engagementNavigation, isReviewPhase1Release),
        },
        {
            label: "Manage",
            items: getVisibleNavigation(accountNavigation, isReviewPhase1Release),
        },
    ]

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => setMounted(true))
        return () => window.cancelAnimationFrame(frameId)
    }, [])

    useEffect(() => {
        if (!open) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [open])

    const close = () => setOpen(false)
    const overlay = mounted
        ? createPortal(
              <div
                  className={cn(
                      "fixed inset-0 z-[9998] transition",
                      open ? "pointer-events-auto" : "pointer-events-none",
                  )}
                  aria-hidden={!open}
              >
                  <button
                      type="button"
                      className={cn(
                          "absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm transition-opacity",
                          open ? "opacity-100" : "opacity-0",
                      )}
                      onClick={close}
                      aria-label="Close navigation"
                  />
                  <aside
                      className={cn(
                          "absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col border-r border-white/[0.08] bg-[#090b13] shadow-[24px_0_80px_rgba(0,0,0,0.5)] transition-transform duration-300",
                          open ? "translate-x-0" : "-translate-x-full",
                      )}
                      aria-label="Mobile navigation"
                  >
                      <div className="flex h-[72px] items-center gap-3 border-b border-white/[0.06] px-4">
                          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-violet-300/20 bg-linear-to-br from-violet-500 via-indigo-500 to-cyan-500">
                              <Zap className="h-5 w-5 text-white" aria-hidden="true" />
                          </span>
                          <div>
                              <p className="text-[15px] font-bold tracking-[-0.025em] text-white">SwiftFlow</p>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/30">
                                  Social command center
                              </p>
                          </div>
                          <button
                              type="button"
                              onClick={close}
                              className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/55"
                              aria-label="Close menu"
                          >
                              <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                      </div>

                      <div className="border-b border-white/[0.055] p-3">
                          <WorkspaceSwitcher
                              activeWorkspace={activeWorkspace}
                              workspaces={workspaces}
                              isCollapsed={false}
                          />
                      </div>

                      <div className="flex-1 overflow-y-auto px-3 py-4">

                          <nav className="space-y-5" aria-label="Primary navigation">
                              {sections.map((section) =>
                                  section.items.length > 0 ? (
                                      <section key={section.label}>
                                          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-white/25">
                                              {section.label}
                                          </p>
                                          <div className="space-y-1">
                                              {section.items.map((item) => (
                                                  <MobileNavigationLink
                                                      key={item.href}
                                                      item={item}
                                                      pathname={pathname}
                                                      onNavigate={close}
                                                  />
                                              ))}
                                          </div>
                                      </section>
                                  ) : null,
                              )}
                          </nav>
                      </div>

                      <div className="border-t border-white/[0.06] p-3">
                          <button
                              type="button"
                              onClick={() => signOut()}
                              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/40 transition hover:bg-rose-400/[0.07] hover:text-rose-200"
                          >
                              <LogOut className="h-4 w-4" aria-hidden="true" />
                              Log out
                          </button>
                      </div>
                  </aside>
              </div>,
              document.body,
          )
        : null

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="sf-icon-button inline-flex"
                aria-label="Open menu"
                aria-expanded={open}
            >
                <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {overlay}
        </>
    )
}
