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
import { Facebook, Instagram, AlertCircle, CheckCircle, Info, Settings, Loader2 } from "lucide-react"
import { InstagramConnectDialog } from "./instagram-connect-dialog"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { useToast } from "@/components/ui/use-toast"

interface ConnectedAccountsProps {
    workspaceId: string;
}

type ConnectedAccountStatus = {
    platform: string
    account_name: string
    metadata?: {
        instagram_business_account_id?: string | null
    } | null
}

function ConnectedAccountSkeleton({ accent }: { accent: "blue" | "pink" }) {
    const iconBg = accent === "blue" ? "bg-cyan-400/10 border border-cyan-300/15" : "bg-rose-400/10 border border-rose-300/15"
    return (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1b1d28] p-4 animate-pulse">
            <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${iconBg}`}>
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

export function ConnectedAccounts({ workspaceId }: ConnectedAccountsProps) {
    const searchParams = useSearchParams();
    const { toast } = useToast()
    const [status, setStatus] = useState<{
        facebook: boolean
        instagram: boolean
        facebookPublishReady: boolean
        facebookReadReady: boolean
        instagramPublishReady: boolean
        publishReady: boolean
        accounts: ConnectedAccountStatus[]
    }>({
        facebook: false,
        instagram: false,
        facebookPublishReady: false,
        facebookReadReady: false,
        instagramPublishReady: false,
        publishReady: false,
        accounts: []
    });
    const [loading, setLoading] = useState(true);
    const [isConnectingMeta, setIsConnectingMeta] = useState(false);
    const [disconnectTarget, setDisconnectTarget] = useState<"facebook" | "instagram" | null>(null)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const canManageIntegrations = useWorkspacePermission("integrations:write");

    // URL params for feedback
    const error = searchParams.get('error');
    const success = searchParams.get('success');
    const pagesCount = searchParams.get('count');
    const errorMessage = searchParams.get('message');
    const errorDetails = searchParams.get('details');
    const callbackWorkspace = searchParams.get('workspace');

    const fetchStatus = useCallback(async () => {
        try {
            const statusRes = await fetch(`/api/brand/social-status?workspaceId=${workspaceId}`);
            if (statusRes.ok) {
                const data = await statusRes.json();
                setStatus(data);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId])

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleConnectPages = () => {
        if (!canManageIntegrations) return;
        if (isConnectingMeta) return;
        setIsConnectingMeta(true);
        redirectToMetaOAuth(workspaceId);
    };

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
                title: disconnectTarget === 'facebook' ? 'Meta accounts disconnected' : 'Instagram disconnected',
                description: disconnectTarget === 'facebook'
                    ? 'Facebook and any linked Instagram account were removed from this workspace.'
                    : 'Instagram was removed from this workspace.',
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
                        Connect your social media accounts to this workspace to start posting.
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
                    {/* Success: Pages Connected */}
                    {success === 'pages_connected' && (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/8 p-4 text-emerald-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <CheckCircle className="h-4 w-4" />
                                Pages Connected Successfully
                            </div>
                            <div className="mt-1 text-sm">
                                Connected {pagesCount || '0'} Facebook Page(s) to your workspace.
                                You can now schedule posts to Facebook and Instagram.
                            </div>
                            {callbackWorkspace && callbackWorkspace !== workspaceId && (
                                <div className="mt-2 text-xs font-medium text-amber-200">
                                    Warning: Pages were connected to a different workspace ({callbackWorkspace.substring(0, 8)}...).
                                    Please switch to that workspace or reconnect.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Success: Login Only */}
                    {success === 'login_success' && (
                        <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-cyan-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <Info className="h-4 w-4" />
                                Logged in with Facebook
                            </div>
                            <div className="mt-1 text-sm">
                                Click &quot;Connect Facebook Pages&quot; below to grant access to your pages.
                            </div>
                        </div>
                    )}

                    {/* Error: No Pages Found */}
                    {error === 'no_pages' && (
                        <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                No Pages Found
                            </div>
                            <div className="mt-2 text-sm">
                                {errorMessage || 'No Facebook Pages found.'}
                            </div>
                            <div className="mt-2 text-xs space-y-1">
                                <p className="font-medium">Make sure:</p>
                                <ul className="list-disc ml-4">
                                    <li>You manage at least one Facebook Page</li>
                                    <li>Your Facebook account is an Admin/Developer in the Meta app</li>
                                    <li>You granted all requested permissions</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Error: Pages Fetch Failed */}
                    {error === 'pages_fetch_failed' && (
                        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Failed to Fetch Pages
                            </div>
                            <div className="mt-1 text-sm">
                                Could not retrieve your Facebook Pages. Please ensure permissions were granted.
                            </div>
                            {errorDetails && (
                                <div className="mt-2 max-h-20 overflow-auto rounded bg-black/20 p-2 text-xs font-mono text-white/70">
                                    {errorDetails}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error: Meta App Not Configured */}
                    {error === 'meta_app_not_configured' && (
                        <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90">
                            <div className="flex items-center gap-2 font-medium">
                                <Settings className="h-4 w-4" />
                                Meta App Not Configured
                            </div>
                            <div className="mt-1 text-sm">
                                You need to configure your Meta app credentials before connecting Facebook Pages.
                                Scroll down to set up your Meta App.
                            </div>
                        </div>
                    )}

                    {/* Generic Error */}
                    {error && error !== 'no_pages' && error !== 'pages_fetch_failed' && error !== 'meta_app_not_configured' && (
                        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Connection Failed
                            </div>
                            <div className="mt-1 text-sm">{errorMessage || error}</div>
                        </div>
                    )}

                    {loading ? (
                        <>
                            <ConnectedAccountSkeleton accent="blue" />
                            <ConnectedAccountSkeleton accent="pink" />
                        </>
                    ) : (
                        <>
                            {!status.publishReady && (status.facebook || status.instagram) && (
                                <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90">
                                    <div className="flex items-center gap-2 font-medium">
                                        <AlertCircle className="h-4 w-4" />
                                        Reconnect for publish access
                                    </div>
                                    <div className="mt-1 text-sm">
                                        At least one connected account is missing publish permissions. Reconnect the affected account before sending live content.
                                    </div>
                                </div>
                            )}

                            {status.facebook && !status.facebookReadReady && (
                                <div className="rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-red-100/90">
                                    <div className="flex items-center gap-2 font-medium">
                                        <AlertCircle className="h-4 w-4" />
                                        Facebook Page read permission missing
                                    </div>
                                    <div className="mt-1 text-sm leading-relaxed">
                                        The current Page token does not include <span className="font-semibold">pages_read_engagement</span>, so native Page posts cannot load. Reconnect once after the latest update. If it persists, remove SwiftFlow from Facebook Business Integrations and connect again.
                                    </div>
                                </div>
                            )}

                            {/* Facebook Connection */}
                            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                                <div className="flex items-center gap-4">
                                    <div className="rounded-full border border-cyan-300/15 bg-cyan-400/10 p-2">
                                        <Facebook className="h-6 w-6 text-cyan-300" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-white/85">Facebook Pages</h4>
                                        <p className="text-sm text-white/50">
                                            {status.facebook
                                                ? status.facebookPublishReady
                                                    ? `${status.accounts.filter(a => a.platform === 'facebook').length} page(s) connected and publish-ready`
                                                    : `${status.accounts.filter(a => a.platform === 'facebook').length} page(s) connected but needs publish re-auth`
                                                : "Not connected"}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant={status.facebook ? "outline" : "default"}
                                    onClick={handleConnectPages}
                                    disabled={!canManageIntegrations || isConnectingMeta}
                                    className={status.facebook
                                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                                        : "border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"}
                                >
                                    {isConnectingMeta ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {status.facebook ? "Reconnecting..." : "Connecting..."}
                                        </>
                                    ) : !canManageIntegrations ? (
                                        "Admin Only"
                                    ) : (
                                        status.facebook ? "Reconnect Pages" : "Connect Facebook Pages"
                                    )}
                                </Button>
                            </div>
                            {status.facebook && canManageIntegrations && (
                                <div className="-mt-2 flex justify-end">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setDisconnectTarget("facebook")}
                                        disabled={isConnectingMeta || isDisconnecting}
                                        className="h-8 rounded-lg px-3 text-xs text-red-300/90 hover:bg-red-500/10 hover:text-red-200"
                                    >
                                        Disconnect Facebook
                                    </Button>
                                </div>
                            )}

                            {/* Instagram Connection */}
                            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                                <div className="flex items-center gap-4">
                                    <div className="rounded-full border border-rose-300/15 bg-rose-400/10 p-2">
                                        <Instagram className="h-6 w-6 text-rose-300" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-white/85">Instagram</h4>
                                        <p className="text-sm text-white/50">
                                            {status.instagram
                                                ? status.instagramPublishReady
                                                    ? "Connected via Facebook and publish-ready"
                                                    : "Connected via Facebook but needs publish re-auth"
                                                : "Not connected"}
                                        </p>
                                    </div>
                                </div>
                                <InstagramConnectDialog
                                    workspaceId={workspaceId}
                                    isConnecting={isConnectingMeta}
                                    onConnectStart={() => setIsConnectingMeta(true)}
                                    trigger={
                                        <Button
                                            variant={status.instagram ? "outline" : "default"}
                                            disabled={!canManageIntegrations || isConnectingMeta}
                                            className={status.instagram
                                                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                                                : "border-rose-300/20 bg-linear-to-r from-rose-400/20 via-rose-300/10 to-amber-300/15 text-white hover:from-rose-400/25 hover:to-amber-300/20"}
                                        >
                                            {isConnectingMeta ? (
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
                                        disabled={isConnectingMeta || isDisconnecting}
                                        className="h-8 rounded-lg px-3 text-xs text-red-300/90 hover:bg-red-500/10 hover:text-red-200"
                                    >
                                        Disconnect Instagram
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Info Note */}
                    <div className="rounded-xl border border-white/10 bg-[#1b1d28] p-3 text-sm text-white/55">
                        <p className="flex items-start gap-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                            <span>
                                <strong>Note:</strong> Instagram Business accounts are connected through Facebook Pages.
                                Connect your Facebook Page first, and any linked Instagram Business accounts will be available automatically.
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
                            {disconnectTarget === "facebook" ? "Disconnect Facebook and linked Instagram?" : "Disconnect Instagram?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{ color: "rgba(255,255,255,0.58)" }}>
                            {disconnectTarget === "facebook"
                                ? "This removes the connected Facebook Page from the workspace and also removes any linked Instagram business account connected through that Meta flow."
                                : "This removes the Instagram account from the workspace. You can reconnect it later from Brand Settings."}
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
