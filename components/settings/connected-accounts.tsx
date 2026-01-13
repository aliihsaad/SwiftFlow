"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Facebook, Instagram, AlertCircle, CheckCircle } from "lucide-react"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"

interface ConnectedAccountsProps {
    workspaceId: string;
}

export function ConnectedAccounts({ workspaceId }: ConnectedAccountsProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<{ facebook: boolean, instagram: boolean, accounts: any[] }>({
        facebook: false,
        instagram: false,
        accounts: []
    });
    const [loading, setLoading] = useState(true);

    const error = searchParams.get('error');
    const success = searchParams.get('success');
    const debugMsg = searchParams.get('debug');
    const pagesCount = searchParams.get('pages_count');

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/brand/social-status?workspaceId=${workspaceId}`);
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                }
            } catch (error) {
                console.error("Failed to fetch status:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();
    }, [workspaceId]);

    const handleFacebookConnect = () => {
        redirectToMetaOAuth(workspaceId);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Connected Accounts</CardTitle>
                <CardDescription>
                    Connect your social media accounts to this workspace to start posting.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {error && (
                    <div className="p-4 rounded-md bg-destructive/15 text-destructive border border-destructive/20">
                        <div className="flex items-center gap-2 font-medium">
                            <AlertCircle className="h-4 w-4" />
                            Connection Failed
                        </div>
                        <div className="mt-1 text-sm">{error}</div>
                    </div>
                )}

                {success === 'meta_connected' && (
                    <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200">
                        <div className="flex items-center gap-2 font-medium">
                            <CheckCircle className="h-4 w-4" />
                            Success
                        </div>
                        <div className="mt-1 text-sm">
                            Facebook authentication successful.
                            {pagesCount ? ` Found ${pagesCount} pages.` : ' No pages found yet.'}
                            {debugMsg && <div className="text-xs font-mono mt-1 text-muted-foreground break-all">{debugMsg}</div>}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <Facebook className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-semibold">Facebook</h4>
                            <p className="text-sm text-muted-foreground">
                                {status.facebook ? "Connected via Pages" : "Not connected"}
                            </p>
                        </div>
                    </div>
                    {status.facebook ? (
                        <Button variant="outline" className="text-green-600 border-green-200 bg-green-50 hover:bg-green-100" onClick={handleFacebookConnect}>
                            Reconnect / Update
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={handleFacebookConnect}>
                            Connect Page
                        </Button>
                    )}
                </div>

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
                    <Button variant="outline" disabled>
                        {status.instagram ? "Connected" : "Connect Business"}
                    </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                    <p>
                        <strong>Note:</strong> Instagram Business accounts are connected through Facebook Pages.
                        Connect your Facebook Page first, and any linked Instagram Business accounts will be available.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
