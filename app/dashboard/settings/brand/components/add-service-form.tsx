"use client"

import { useState } from "react"
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

interface ExternalService {
    id: string
    service_name: string
    website: string | null
    email: string | null
    password: null
    subscription_tier: string | null
    price: string | null
    api_key: null
    has_password: boolean
    has_api_key: boolean
}

interface AddServiceFormProps {
    workspaceId: string
    onSuccess: () => void
    initialData?: ExternalService
    trigger?: React.ReactElement
}

export function AddServiceForm({ workspaceId, onSuccess, initialData, trigger }: AddServiceFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const [name, setName] = useState(initialData?.service_name || "")
    const [website, setWebsite] = useState(initialData?.website || "")
    const [email, setEmail] = useState(initialData?.email || "")
    const [password, setPassword] = useState("")
    const [subscription, setSubscription] = useState(initialData?.subscription_tier || "")
    const [price, setPrice] = useState(initialData?.price || "")
    const [apiKey, setApiKey] = useState("")
    const [clearPassword, setClearPassword] = useState(false)
    const [clearApiKey, setClearApiKey] = useState(false)

    const hasSavedPassword = Boolean(initialData?.has_password) && !clearPassword && !password
    const hasSavedApiKey = Boolean(initialData?.has_api_key) && !clearApiKey && !apiKey

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        setLoading(true)

        try {
            const serviceData = {
                service_name: name,
                website,
                email,
                password,
                subscription_tier: subscription,
                price,
                api_key: apiKey,
                clear_password: clearPassword,
                clear_api_key: clearApiKey,
            }

            const response = initialData
                ? await fetch(`/api/external-services/${initialData.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId, ...serviceData }),
                })
                : await fetch("/api/external-services", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId, ...serviceData }),
                })

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload?.error || `Failed to ${initialData ? "update" : "add"} service`)
            }

            toast({
                title: initialData ? "Service updated" : "Service added",
                description: initialData
                    ? "The service and its credential changes were saved."
                    : "The external service was saved with encrypted credentials.",
            })
            setOpen(false)
            resetForm()
            onSuccess()
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : `Failed to ${initialData ? "update" : "add"} service.`,
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        if (!initialData) {
            setName("")
            setWebsite("")
            setEmail("")
            setSubscription("")
            setPrice("")
        }
        setPassword("")
        setApiKey("")
        setClearPassword(false)
        setClearApiKey(false)
    }

    const inputClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:border-cyan-300/20 focus-visible:ring-cyan-400/30"
    const labelClass = "text-white/70"
    const secondaryBtnClass = "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            setOpen(nextOpen)
            if (!nextOpen) resetForm()
        }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/15 to-amber-300/15 text-white hover:from-cyan-400/20 hover:to-amber-300/20">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Service
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#151620] text-white/85 sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-white/90">{initialData ? "Edit" : "Add"} External Service</DialogTitle>
                    <DialogDescription className="text-white/55">
                        Existing credentials are never loaded into this form. Leave a secret blank to keep it unchanged.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor={`name-${initialData?.id || "new"}`} className={labelClass}>Service Name *</Label>
                        <Input
                            id={`name-${initialData?.id || "new"}`}
                            required
                            className={inputClass}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Canva, Zapier"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`website-${initialData?.id || "new"}`} className={labelClass}>Website</Label>
                        <Input
                            id={`website-${initialData?.id || "new"}`}
                            className={inputClass}
                            value={website}
                            onChange={(event) => setWebsite(event.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor={`email-${initialData?.id || "new"}`} className={labelClass}>Email / Username</Label>
                            <Input
                                id={`email-${initialData?.id || "new"}`}
                                className={inputClass}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`password-${initialData?.id || "new"}`} className={labelClass}>Password</Label>
                            <Input
                                id={`password-${initialData?.id || "new"}`}
                                className={inputClass}
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value)
                                    if (event.target.value) setClearPassword(false)
                                }}
                                type="password"
                                autoComplete="new-password"
                                placeholder={hasSavedPassword ? "Saved — enter a replacement" : "Stored encrypted at rest"}
                            />
                            {initialData?.has_password && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-white/50 hover:text-white"
                                    onClick={() => {
                                        setPassword("")
                                        setClearPassword((current) => !current)
                                    }}
                                >
                                    {clearPassword
                                        ? <><RotateCcw className="mr-1 h-3 w-3" />Keep saved password</>
                                        : <><Trash2 className="mr-1 h-3 w-3" />Remove saved password</>}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor={`subscription-${initialData?.id || "new"}`} className={labelClass}>Subscription</Label>
                            <Input
                                id={`subscription-${initialData?.id || "new"}`}
                                className={inputClass}
                                value={subscription}
                                onChange={(event) => setSubscription(event.target.value)}
                                placeholder="e.g. Pro, Enterprise"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`price-${initialData?.id || "new"}`} className={labelClass}>Price</Label>
                            <Input
                                id={`price-${initialData?.id || "new"}`}
                                className={inputClass}
                                value={price}
                                onChange={(event) => setPrice(event.target.value)}
                                placeholder="e.g. $29/mo"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`api-${initialData?.id || "new"}`} className={labelClass}>API Key (if applicable)</Label>
                        <Input
                            id={`api-${initialData?.id || "new"}`}
                            className={`${inputClass} font-mono text-sm`}
                            type="password"
                            autoComplete="off"
                            value={apiKey}
                            onChange={(event) => {
                                setApiKey(event.target.value)
                                if (event.target.value) setClearApiKey(false)
                            }}
                            placeholder={hasSavedApiKey ? "Saved — enter a replacement" : "Stored encrypted at rest"}
                        />
                        {initialData?.has_api_key && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-white/50 hover:text-white"
                                onClick={() => {
                                    setApiKey("")
                                    setClearApiKey((current) => !current)
                                }}
                            >
                                {clearApiKey
                                    ? <><RotateCcw className="mr-1 h-3 w-3" />Keep saved API key</>
                                    : <><Trash2 className="mr-1 h-3 w-3" />Remove saved API key</>}
                            </Button>
                        )}
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" className={secondaryBtnClass} onClick={() => setOpen(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                        >
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {initialData ? "Update" : "Save"} Service
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
