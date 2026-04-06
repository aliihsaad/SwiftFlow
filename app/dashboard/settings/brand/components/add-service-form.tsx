"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface ExternalService {
    id: string
    service_name: string
    website: string | null
    email: string | null
    password: string | null
    subscription_tier: string | null
    price: string | null
    api_key: string | null
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

    // Form states
    const [name, setName] = useState(initialData?.service_name || "")
    const [website, setWebsite] = useState(initialData?.website || "")
    const [email, setEmail] = useState(initialData?.email || "")
    const [password, setPassword] = useState(initialData?.password || "")
    const [subscription, setSubscription] = useState(initialData?.subscription_tier || "")
    const [price, setPrice] = useState(initialData?.price || "")
    const [apiKey, setApiKey] = useState(initialData?.api_key || "")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const serviceData = {
                service_name: name,
                website,
                email,
                password,
                subscription_tier: subscription,
                price,
                api_key: apiKey
            }

            let response: Response
            if (initialData) {
                response = await fetch(`/api/external-services/${initialData.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId, ...serviceData }),
                })
            } else {
                response = await fetch("/api/external-services", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId, ...serviceData }),
                })
            }
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload?.error || `Failed to ${initialData ? "update" : "add"} service`)
            }

            toast({
                title: initialData ? "Service updated" : "Service added",
                description: initialData
                    ? "The external service has been successfully updated."
                    : "The external service has been successfully added.",
            })

            setOpen(false)
            resetForm()
            onSuccess()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to ${initialData ? 'update' : 'add'} service.`
            toast({
                title: "Error",
                description: message,
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setName("")
        setWebsite("")
        setEmail("")
        setPassword("")
        setSubscription("")
        setPrice("")
        setApiKey("")
    }

    const inputClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const labelClass = "text-white/70"
    const secondaryBtnClass = "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/15 to-amber-300/15 text-white hover:from-cyan-400/20 hover:to-amber-300/20">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Service
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh] border-white/10 bg-[#151620] text-white/85">
                <DialogHeader>
                    <DialogTitle className="text-white/90">{initialData ? 'Edit' : 'Add'} External Service</DialogTitle>
                    <DialogDescription className="text-white/55">
                        {initialData ? 'Update' : 'Store'} credentials for external services used by your brand.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className={labelClass}>Service Name *</Label>
                        <Input
                            id="name"
                            required
                            className={inputClass}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Canva, Zapier"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website" className={labelClass}>Website</Label>
                        <Input
                            id="website"
                            className={inputClass}
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className={labelClass}>Email / Username</Label>
                            <Input
                                id="email"
                                className={inputClass}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className={labelClass}>Password</Label>
                            <Input
                                id="password"
                                className={inputClass}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                type="text"
                                placeholder="Stored encrypted at rest"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="subscription" className={labelClass}>Subscription</Label>
                            <Input
                                id="subscription"
                                className={inputClass}
                                value={subscription}
                                onChange={(e) => setSubscription(e.target.value)}
                                placeholder="e.g. Pro, Enterprise"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price" className={labelClass}>Price</Label>
                            <Input
                                id="price"
                                className={inputClass}
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="e.g. $29/mo"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="api" className={labelClass}>API Key (if applicable)</Label>
                        <Input
                            id="api"
                            className={`${inputClass} font-mono text-sm`}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
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
                            {initialData ? 'Update' : 'Save'} Service
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
