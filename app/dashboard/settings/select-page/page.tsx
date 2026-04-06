"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Facebook, Instagram, CheckCircle, Loader2, AlertCircle, ArrowLeft } from "lucide-react"

interface PageData {
    id: string
    name: string
    category: string
    access_token: string
    ig_account_id: string | null
    ig_username: string | null
}

interface SessionData {
    workspace_id: string
    pages_data: PageData[]
}

export default function SelectPagePage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const sessionId = searchParams.get("session")

    const [session, setSession] = useState<SessionData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    // Fetch session data
    useEffect(() => {
        if (!sessionId) {
            setError("No session ID provided. Please start the connection flow again.")
            setLoading(false)
            return
        }

        const fetchSession = async () => {
            try {
                const res = await fetch(`/api/auth/meta/page-session?sessionId=${sessionId}`)
                if (!res.ok) {
                    const data = await res.json()
                    setError(data.error || "Failed to load pages. Please try again.")
                    setLoading(false)
                    return
                }

                const data = await res.json()
                setSession(data)

                // Auto-select if only 1 page
                if (data.pages_data?.length === 1) {
                    setSelectedPageId(data.pages_data[0].id)
                }
            } catch (err) {
                setError("Failed to load pages. Please try again.")
            } finally {
                setLoading(false)
            }
        }

        fetchSession()
    }, [sessionId])

    const handleConfirm = async () => {
        if (!selectedPageId || !sessionId) return

        setSaving(true)
        try {
            const res = await fetch("/api/auth/meta/select-page", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, selectedPageId }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Failed to save selection.")
                setSaving(false)
                return
            }

            // Success — redirect to brand settings
            router.push("/dashboard/settings/brand?success=page_connected")
        } catch (err) {
            setError("An error occurred. Please try again.")
            setSaving(false)
        }
    }

    // Loading state
    if (loading) {
        return (
            <div className="container max-w-2xl py-16 flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading your Facebook pages...</p>
            </div>
        )
    }

    // Error state
    if (error) {
        return (
            <div className="container max-w-2xl py-16">
                <Card className="border-destructive/50">
                    <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
                        <AlertCircle className="h-10 w-10 text-destructive" />
                        <div>
                            <p className="font-semibold text-lg">Something went wrong</p>
                            <p className="text-muted-foreground mt-1">{error}</p>
                        </div>
                        <Button variant="outline" onClick={() => router.push("/dashboard/settings/brand")}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Settings
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const pages = session?.pages_data || []

    return (
        <div className="container max-w-2xl py-8">
            <div className="mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/dashboard/settings/brand")}
                    className="mb-4"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Settings
                </Button>
                <h1 className="text-2xl font-bold">Select a Facebook Page</h1>
                <p className="text-muted-foreground mt-1">
                    Choose which Facebook page to connect to this workspace.
                    Only <strong>one page</strong> can be connected per workspace.
                </p>
            </div>

            <div className="space-y-3">
                {pages.map((page) => (
                    <Card
                        key={page.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-md ${selectedPageId === page.id
                            ? "ring-2 ring-primary border-primary shadow-md"
                            : "hover:border-muted-foreground/30"
                            }`}
                        onClick={() => setSelectedPageId(page.id)}
                    >
                        <CardContent className="py-4 px-5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-full ${selectedPageId === page.id
                                    ? "bg-primary/10"
                                    : "bg-muted"
                                    }`}>
                                    <Facebook className={`h-5 w-5 ${selectedPageId === page.id
                                        ? "text-primary"
                                        : "text-blue-500"
                                        }`} />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{page.name}</p>
                                    {page.category && (
                                        <p className="text-xs text-muted-foreground">{page.category}</p>
                                    )}
                                    {page.ig_account_id && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Instagram className="h-3.5 w-3.5 text-pink-500" />
                                            <span className="text-xs text-muted-foreground">
                                                {page.ig_username ? `@${page.ig_username}` : "Instagram connected"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedPageId === page.id && (
                                <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Info note about Instagram */}
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
                <div className="flex gap-2">
                    <Instagram className="h-4 w-4 text-pink-500 shrink-0 mt-0.5" />
                    <p>
                        If your Facebook page has a linked Instagram Business account, it will be connected automatically.
                    </p>
                </div>
            </div>

            {/* Confirm button */}
            <div className="mt-6 flex justify-end">
                <Button
                    onClick={handleConfirm}
                    disabled={!selectedPageId || saving}
                    size="lg"
                >
                    {saving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                        </>
                    ) : (
                        "Connect Selected Page"
                    )}
                </Button>
            </div>
        </div>
    )
}
