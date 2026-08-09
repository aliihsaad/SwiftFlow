"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Instagram, AlertCircle, CheckCircle, Info, Loader2 } from "lucide-react"
import { InstagramConnectDialog } from "./instagram-connect-dialog"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { useToast } from "@/components/ui/use-toast"
import {
    type ConnectedSocialAccount,
    type InstagramTokenHealth,
    type RenewalNotice,
    deriveRenewalNotice,
} from "@/lib/instagram-token-renewal-notice"

interface ConnectedAccountsProps {
    workspaceId: string;
}

type InstagramAutomationHealth = {
    status: "not_connected" | "action_required" | "ready"
    ready: boolean
    checks: {
        connected: boolean
        professionalAccount: boolean
        requiredPermissions: boolean
        tokenValid: boolean
        commentsWebhook: boolean
    }
}

const NOTICE_TONE_CLASSES: Record<RenewalNotice['tone'], string> = {
    error: "rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-red-100/90",
    warning: "rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90",
    success: "rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100/90",
}

function ConnectedAccountSkeleton() {
    return (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1b1d28] p-4 animate-pulse">
            <div className="flex items-center gap-4">
                <div className="rounded-full border border-rose-300/15 bg-rose-400/10 p-2">
                    <div className="h-6 w-6 rounded bg-white/40 dark:bg-white/10" />
                </div>
                <div className="space-y-2">
                    <div className="h-4 w-36 rounded bg-muted" />
                    <div className="h-3 w-28 rounded bg-muted/80" />
                </div>
            </div>
            <div className="h-9 w-40 rounded-md bg-muted" />
        </div>
    )
}

async function requestConnectedAccountStatus(workspaceId: string) {
    const response = await fetch(`/api/brand/social-status?workspaceId=${workspaceId}`)
    if (!response.ok) return null
    return response.json()
}

export function ConnectedAccounts({ workspaceId }: ConnectedAccountsProps) {
    const searchParams = useSearchParams();
    const { toast } = useToast()
    const [status, setStatus] = useState<{
        instagram: boolean
        tokenHealth?: InstagramTokenHealth
        instagramConnectionMethod?: "instagram_login" | null
        instagramAutomationHealth: InstagramAutomationHealth
        accounts?: ConnectedSocialAccount[]
    }>({
        instagram: false,
        tokenHealth: null,
        instagramConnectionMethod: null,
        instagramAutomationHealth: {
            status: "not_connected",
            ready: false,
            checks: {
                connected: false,
                professionalAccount: false,
                requiredPermissions: false,
                tokenValid: false,
                commentsWebhook: false,
            },
        },
        accounts: [],
    });
    const [loading, setLoading] = useState(true);
    const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
    const [disconnectTarget, setDisconnectTarget] = useState<"instagram" | null>(null)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const canManageIntegrations = useWorkspacePermission("integrations:write");

    const error = searchParams.get('error');
    const success = searchParams.get('success');
    const errorMessage = searchParams.get('message');

    const instagramAccount = status.accounts?.find((account) => account.platform === 'instagram');
    const renewalNotice = deriveRenewalNotice(status.instagram, instagramAccount, status.tokenHealth ?? null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await requestConnectedAccountStatus(workspaceId)
            if (data) setStatus(data)
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId])

    useEffect(() => {
        let cancelled = false

        void requestConnectedAccountStatus(workspaceId)
            .then((data) => {
                if (!cancelled && data) setStatus(data)
            })
            .catch((error) => {
                if (!cancelled) console.error("Failed to fetch data:", error)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [workspaceId]);

    const handleDisconnectConfirm = async () => {
        if (!disconnectTarget || !canManageIntegrations) return

        setIsDisconnecting(true)
        try {
            const response = await fetch(`/api/brand/social-accounts?workspaceId=${workspaceId}&platform=${disconnectTarget}`, {
                method: 'DELETE',
            })
            const payload = await response.json().catch(() => ({}))

            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to disconnect account')
            }

            await fetchStatus()
            setDisconnectTarget(null)
            toast({
                title: 'Instagram disconnected',
                description: 'Instagram was removed from this workspace.',
            })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to disconnect account'
            toast({
                title: 'Disconnect failed',
                description: message,
                variant: 'destructive',
            })
        } finally {
            setIsDisconnecting(false)
        }
    }

    return (
        <>
            <Card className="border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]">
                <CardHeader>
                    <CardTitle className="text-white/90">Connected Accounts</CardTitle>
                    <CardDescription className="text-white/50">
                        Connect one Instagram professional account for inbox, analytics, and automations.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!canManageIntegrations && (
                        <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <Info className="h-4 w-4" />
                                Read-only access
                            </div>
                            <div className="mt-1 text-sm">
                                Only admins and owners can connect or reconnect social accounts.
                            </div>
                        </div>
                    )}
                    {success === 'instagram_connected' && (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/8 p-4 text-emerald-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <CheckCircle className="h-4 w-4" />
                                Instagram connected directly
                            </div>
                            <div className="mt-1 text-sm">
                                The professional account is connected.
                                {status.instagramAutomationHealth.ready
                                    ? ' Comment automations are ready.'
                                    : ' Finish the webhook check in Quick Start before enabling automations.'}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Connection Failed
                            </div>
                            <div className="mt-1 text-sm">{errorMessage || error}</div>
                        </div>
                    )}

                    {loading ? (
                        <ConnectedAccountSkeleton />
                    ) : (
                        <>
                            {renewalNotice && (
                                <div className={NOTICE_TONE_CLASSES[renewalNotice.tone]}>
                                    <div className="flex items-center gap-2 font-medium">
                                        {renewalNotice.tone === 'success'
                                            ? <CheckCircle className="h-4 w-4" />
                                            : <AlertCircle className="h-4 w-4" />}
                                        {renewalNotice.title}
                                    </div>
                                    <div className="mt-1 text-sm">{renewalNotice.message}</div>
                                </div>
                            )}

                            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                                <div className="flex items-center gap-4">
                                    <div className="rounded-full border border-rose-300/15 bg-rose-400/10 p-2">
                                        <Instagram className="h-6 w-6 text-rose-300" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-white/85">Instagram</h4>
                                        <p className="text-sm text-white/50">
                                            {status.instagram
                                                ? status.instagramAutomationHealth.ready
                                                    ? "Connected and automation-ready"
                                                    : "Connected — setup needs attention"
                                                : "Not connected"}
                                        </p>
                                    </div>
                                </div>
                                <InstagramConnectDialog
                                    workspaceId={workspaceId}
                                    isConnecting={isConnectingInstagram}
                                    onConnectStart={() => setIsConnectingInstagram(true)}
                                    trigger={
                                        <Button
                                            variant={status.instagram ? "outline" : "default"}
                                            disabled={!canManageIntegrations || isConnectingInstagram}
                                            className={status.instagram
                                                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                                                : "border-rose-300/20 bg-linear-to-r from-rose-400/20 via-rose-300/10 to-amber-300/15 text-white hover:from-rose-400/25 hover:to-amber-300/20"}
                                        >
                                            {isConnectingInstagram ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    {status.instagram ? "Reconnecting..." : "Connecting..."}
                                                </>
                                            ) : !canManageIntegrations ? (
                                                "Admin Only"
                                            ) : (
                                                status.instagram ? "Reconnect Instagram" : "Connect Instagram"
                                            )}
                                        </Button>
                                    }
                                />
                            </div>
                            {status.instagram && canManageIntegrations && (
                                <div className="-mt-2 flex justify-end">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setDisconnectTarget("instagram")}
                                        disabled={isConnectingInstagram || isDisconnecting}
                                        className="h-8 rounded-lg px-3 text-xs text-red-300/90 hover:bg-red-500/10 hover:text-red-200"
                                    >
                                        Disconnect Instagram
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    <div className="rounded-xl border border-white/10 bg-[#1b1d28] p-3 text-sm text-white/55">
                        <p className="flex items-start gap-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                            <span>
                                SwiftFlow stable v1 is Instagram-only. Connect a Business or Creator account to use inbox, analytics, and automations.
                            </span>
                        </p>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => !open && !isDisconnecting && setDisconnectTarget(null)}>
                <AlertDialogContent
                    className="border-0"
                    style={{
                        background: "#1b1d28",
                        color: "rgba(255,255,255,0.88)",
                        boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset",
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle style={{ color: "rgba(255,255,255,0.92)" }}>
                            Disconnect Instagram?
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{ color: "rgba(255,255,255,0.58)" }}>
                            This removes the Instagram account from the workspace. You can reconnect it later from Settings → Instagram.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isDisconnecting}
                            className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDisconnectConfirm}
                            disabled={isDisconnecting}
                            className="border border-red-500/20 bg-red-500/15 text-red-200 hover:bg-red-500/20"
                        >
                            {isDisconnecting ? "Disconnecting…" : "Disconnect"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
