"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Scheduled", href: "/dashboard/scheduled" },
    { label: "Analytics", href: "/dashboard/analytics" },
    { label: "Assistant", href: "/dashboard/assistant" },
]

export function AnalyticsNavbar() {
    const pathname = usePathname()

    return (
        <nav className="border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex h-16 items-center justify-between px-6">
                {/* Left side */}
                <div className="flex items-center gap-8">
                    {/* Logo */}
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Image
                            src="/logo.png"
                            alt="SwiftFlow Logo"
                            width={24}
                            height={24}
                            className="rounded-md"
                        />
                        <span className="text-lg font-bold bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                            SwiftFlow
                        </span>
                    </Link>

                    {/* Nav items */}
                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                                        isActive
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                    )}
                                >
                                    {item.label}
                                </Link>
                            )
                        })}
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" className="text-sm">
                        Support
                    </Button>
                    <Button variant="ghost" size="sm" className="text-sm">
                        Settings
                    </Button>
                    <div className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                        Swift Digital Solutions
                    </div>
                </div>
            </div>
        </nav>
    )
}
