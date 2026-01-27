"use client"

import { Button } from "@/components/ui/button"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"
import { Facebook } from "lucide-react"

/**
 * Connect Meta/Facebook Button
 * Initiates OAuth flow to connect user's Facebook account
 */
export function ConnectMetaButton({ workspaceId }: { workspaceId?: string }) {
    const handleConnect = () => {
        redirectToMetaOAuth(workspaceId);
    };

    return (
        <Button onClick={handleConnect} variant="outline" className="w-full">
            <Facebook className="mr-2 h-4 w-4" />
            Connect Facebook Account
        </Button>
    );
}
