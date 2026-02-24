"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"
import { Facebook, Loader2 } from "lucide-react"

/**
 * Connect Meta/Facebook Button
 * Initiates OAuth flow to connect user's Facebook account
 */
export function ConnectMetaButton({ workspaceId }: { workspaceId?: string }) {
    const [isConnecting, setIsConnecting] = useState(false)

    const handleConnect = () => {
        if (isConnecting) return
        setIsConnecting(true)
        redirectToMetaOAuth(workspaceId);
    };

    return (
        <Button onClick={handleConnect} disabled={isConnecting} variant="outline" className="w-full">
            {isConnecting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting…
                </>
            ) : (
                <>
                    <Facebook className="mr-2 h-4 w-4" />
                    Connect Facebook Account
                </>
            )}
        </Button>
    );
}
