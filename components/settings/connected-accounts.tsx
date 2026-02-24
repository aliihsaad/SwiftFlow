"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Facebook, Instagram, AlertCircle, CheckCircle, Info, Settings, Loader2 } from "lucide-react"
import { InstagramConnectDialog } from "./instagram-connect-dialog"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"

interface ConnectedAccountsProps {
    workspaceId: string;
}

export function ConnectedAccounts({ workspaceId }: ConnectedAccountsProps) {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<{ facebook: boolean, instagram: boolean, accounts: any[] }>({
        facebook: false,
        instagram: false,
        accounts: []
    });
    const [loading, setLoading] = useState(true);
    const [isConnectingMeta, setIsConnectingMeta] = useState(false);

    // URL params for feedback
    const error = searchParams.get('error');
    const success = searchParams.get('success');
    const pagesCount = searchParams.get('count');
    const errorMessage = searchParams.get('message');
    const errorDetails = searchParams.get('details');
    const callbackWorkspace = searchParams.get('workspace');

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch social status
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
        };

        fetchData();
    }, [workspaceId]);

    const handleConnectPages = () => {
        if (isConnectingMeta) return;
        setIsConnectingMeta(true);
        redirectToMetaOAuth(workspaceId);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Connected Accounts</CardTitle>
                    <CardDescription>
                        Connect your social media accounts to this workspace to start posting.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Success: Pages Connected */}
                    {success === 'pages_connected' && (
                        <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200">
                            <div className="flex items-center gap-2 font-medium">
                                <CheckCircle className="h-4 w-4" />
                                Pages Connected Successfully
                            </div>
                            <div className="mt-1 text-sm">
                                Connected {pagesCount || '0'} Facebook Page(s) to your workspace.
                                You can now schedule posts to Facebook and Instagram.
                            </div>
                            {callbackWorkspace && callbackWorkspace !== workspaceId && (
                                <div className="mt-2 text-xs text-amber-600 font-medium">
                                    Warning: Pages were connected to a different workspace ({callbackWorkspace.substring(0, 8)}...).
                                    Please switch to that workspace or reconnect.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Success: Login Only */}
                    {success === 'login_success' && (
                        <div className="p-4 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                            <div className="flex items-center gap-2 font-medium">
                                <Info className="h-4 w-4" />
                                Logged in with Facebook
                            </div>
                            <div className="mt-1 text-sm">
                                Click "Connect Facebook Pages" below to grant access to your pages.
                            </div>
                        </div>
                    )}

                    {/* Error: No Pages Found */}
                    {error === 'no_pages' && (
                        <div className="p-4 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
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
                        <div className="p-4 rounded-md bg-destructive/15 text-destructive border border-destructive/20">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Failed to Fetch Pages
                            </div>
                            <div className="mt-1 text-sm">
                                Could not retrieve your Facebook Pages. Please ensure permissions were granted.
                            </div>
                            {errorDetails && (
                                <div className="mt-2 text-xs font-mono bg-black/10 p-2 rounded overflow-auto max-h-20">
                                    {errorDetails}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error: Meta App Not Configured */}
                    {error === 'meta_app_not_configured' && (
                        <div className="p-4 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
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
                        <div className="p-4 rounded-md bg-destructive/15 text-destructive border border-destructive/20">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                Connection Failed
                            </div>
                            <div className="mt-1 text-sm">{errorMessage || error}</div>
                        </div>
                    )}

                    {/* Facebook Connection */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                                <Facebook className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <h4 className="font-semibold">Facebook Pages</h4>
                                <p className="text-sm text-muted-foreground">
                                    {status.facebook
                                        ? `${status.accounts.filter(a => a.platform === 'facebook').length} page(s) connected`
                                        : "Not connected"}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant={status.facebook ? "outline" : "default"}
                            onClick={handleConnectPages}
                            disabled={isConnectingMeta}
                            className={status.facebook ? "text-green-600 border-green-200 bg-green-50 hover:bg-green-100" : ""}
                        >
                            {isConnectingMeta ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {status.facebook ? "Reconnecting..." : "Connecting..."}
                                </>
                            ) : (
                                status.facebook ? "Reconnect Pages" : "Connect Facebook Pages"
                            )}
                        </Button>
                    </div>

                    {/* Instagram Connection */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-full">
                                <Instagram className="h-6 w-6 text-pink-600" />
                            </div>
                            <div>
                                <h4 className="font-semibold">Instagram</h4>
                                <p className="text-sm text-muted-foreground">
                                    {status.instagram ? "Connected via Facebook" : "Not connected"}
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
                                    disabled={isConnectingMeta}
                                    className={status.instagram ? "text-green-600 border-green-200 bg-green-50 hover:bg-green-100" : "bg-pink-600 hover:bg-pink-700 text-white"}
                                >
                                    {isConnectingMeta ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {status.instagram ? "Reconnecting..." : "Connecting..."}
                                        </>
                                    ) : (
                                        status.instagram ? "Reconnect Instagram" : "Connect Instagram"
                                    )}
                                </Button>
                            }
                        />
                    </div>

                    {/* Info Note */}
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                        <p className="flex items-start gap-2">
                            <Info className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                <strong>Note:</strong> Instagram Business accounts are connected through Facebook Pages.
                                Connect your Facebook Page first, and any linked Instagram Business accounts will be available automatically.
                            </span>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </>
    )
}
