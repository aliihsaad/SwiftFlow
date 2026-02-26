"use client"

import { Loader2 } from "lucide-react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

export function AcceptInviteSubmit() {
    const { pending } = useFormStatus()

    return (
        <Button
            type="submit"
            disabled={pending}
            className="w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
        >
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Accepting...
                </>
            ) : (
                "Accept Invite"
            )}
        </Button>
    )
}
