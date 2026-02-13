"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Copy, ExternalLink, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Settings } from "lucide-react"
import { META_SCOPE } from "@/utils/meta-oauth"

interface MetaAppConfigProps {
    workspaceId: string
}

export function MetaAppConfig({ workspaceId }: MetaAppConfigProps) {
    const [appId, setAppId] = useState("")
    const [appSecret, setAppSecret] = useState("")
    const [showSecret, setShowSecret] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [isConfigured, setIsConfigured] = useState(false)
    const [showInstructions, setShowInstructions] = useState(false)
    const [copiedField, setCopiedField] = useState<string | null>(null)

    const redirectUri = 'https://social.swiftdigital-s.com/api/auth/meta/callback'

    useEffect(() => {
        fetchSettings()
    }, [workspaceId])

    const fetchSettings = async () => {
        try {
            const res = await fetch(`/api/workspace/settings?workspaceId=${workspaceId}`)
            if (res.ok) {
                const data = await res.json()
                if (data.meta_app_id) {
                    setAppId(data.meta_app_id)
                    setIsConfigured(true)
                }
                if (data.meta_app_secret) {
                    setAppSecret(data.meta_app_secret)
                }
            }
        } catch (error) {
            console.error("Failed to fetch settings:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setSaved(false)

        try {
            const res = await fetch(`/api/workspace/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    meta_app_id: appId,
                    meta_app_secret: appSecret
                })
            })

            if (res.ok) {
                setSaved(true)
                setIsConfigured(!!appId && !!appSecret)
                setTimeout(() => setSaved(false), 3000)
            }
        } catch (error) {
            console.error("Failed to save settings:", error)
        } finally {
            setSaving(false)
        }
    }

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text)
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
    }

    const requiredScopes = META_SCOPE.split(',')

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    <CardTitle>Meta App Configuration</CardTitle>
                </div>
                <CardDescription>
                    Configure your own Meta app to connect Facebook and Instagram accounts.
                    This allows you to bypass Meta's app review process.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Status Badge */}
                {isConfigured && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm text-green-700">
                            Meta app is configured. You can now connect your Facebook Pages.
                        </span>
                    </div>
                )}

                {/* Setup Instructions */}
                <div>
                    <Button
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => setShowInstructions(!showInstructions)}
                    >
                        <span>How to create your Meta App</span>
                        {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    {showInstructions && (
                    <div className="mt-4 space-y-4">
                        <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
                            <h4 className="font-semibold">Step 1: Create a Meta App</h4>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                <li>
                                    Go to{" "}
                                    <a
                                        href="https://developers.facebook.com/apps"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                    >
                                        Meta for Developers <ExternalLink className="h-3 w-3" />
                                    </a>
                                </li>
                                <li>Click "Create App" and select "Business" type</li>
                                <li>Enter your app name and contact email</li>
                                <li>After creation, go to App Settings → Basic to find your App ID and App Secret</li>
                            </ol>

                            <h4 className="font-semibold mt-4">Step 2: Configure OAuth Settings</h4>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                <li>Go to Facebook Login → Settings in your app dashboard</li>
                                <li>Add the following OAuth Redirect URI:</li>
                            </ol>
                            <div className="flex items-center gap-2 mt-2">
                                <code className="flex-1 bg-black/5 dark:bg-white/10 px-3 py-2 rounded text-sm break-all">
                                    {redirectUri}
                                </code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyToClipboard(redirectUri, 'redirect')}
                                >
                                    {copiedField === 'redirect' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>

                            <h4 className="font-semibold mt-4">Step 3: Add Required Products</h4>
                            <p className="text-sm text-muted-foreground">
                                In your Meta app dashboard, add these products:
                            </p>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                <li>Facebook Login for Business</li>
                                <li>Instagram Basic Display (optional, for IG insights)</li>
                            </ul>

                            <h4 className="font-semibold mt-4">Step 4: Add Yourself as Admin/Developer</h4>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                <li>Go to App Roles → Roles</li>
                                <li>Add your Facebook account as an Admin or Developer</li>
                                <li>This grants you all permissions without app review</li>
                            </ol>

                            <h4 className="font-semibold mt-4">Required Permissions (Auto-granted to Admins)</h4>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {requiredScopes.map((scope) => (
                                    <span key={scope} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                                        {scope}
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                As an app admin, these permissions are automatically available to you without going through Meta's review process.
                            </p>
                        </div>
                    </div>
                    )}
                </div>

                {/* Configuration Form */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="app-id">Meta App ID</Label>
                        <Input
                            id="app-id"
                            placeholder="Enter your Meta App ID"
                            value={appId}
                            onChange={(e) => setAppId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Found in App Settings → Basic in your Meta app dashboard
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="app-secret">Meta App Secret</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    id="app-secret"
                                    type={showSecret ? "text" : "password"}
                                    placeholder="Enter your Meta App Secret"
                                    value={appSecret}
                                    onChange={(e) => setAppSecret(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                    onClick={() => setShowSecret(!showSecret)}
                                >
                                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Click "Show" next to App Secret in your Meta app settings, then copy it here
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button onClick={handleSave} disabled={saving || !appId || !appSecret}>
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Configuration"
                            )}
                        </Button>
                        {saved && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                                <CheckCircle className="h-4 w-4" />
                                Saved successfully
                            </span>
                        )}
                    </div>
                </div>

                {/* Security Note */}
                <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
                    <strong>Security Note:</strong> Your App Secret is stored securely and never exposed to the client.
                    Only share your App ID and Secret with trusted team members who manage this workspace.
                </div>
            </CardContent>
        </Card>
    )
}
