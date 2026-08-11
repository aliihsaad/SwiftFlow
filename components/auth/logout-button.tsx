"use client"

import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"
import { toast } from "sonner"
import { signOut } from "@/app/actions/auth"
import { cn } from "@/lib/utils"

type LogoutButtonProps = {
    className?: string
    hideLabel?: boolean
}

export function LogoutButton({ className, hideLabel = false }: LogoutButtonProps) {
    const [isPending, setIsPending] = useState(false)

    const handleLogout = async () => {
        if (isPending) return

        setIsPending(true)
        try {
            const result = await signOut()

            if (!result.ok) {
                toast.error(result.error)
                setIsPending(false)
                return
            }

            window.location.replace("/login")
        } catch {
            toast.error("SwiftFlow could not sign you out. Please try again.")
            setIsPending(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className={cn(className, "disabled:cursor-wait disabled:opacity-60")}
            aria-label={isPending ? "Signing out" : "Log out"}
        >
            {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
                <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            {hideLabel ? null : <span>{isPending ? "Signing out…" : "Log out"}</span>}
        </button>
    )
}
