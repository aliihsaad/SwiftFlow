"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
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
    const supabase = createClient()

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
                workspace_id: workspaceId,
                service_name: name,
                website,
                email,
                password,
                subscription_tier: subscription,
                price,
                api_key: apiKey
            }

            let error
            if (initialData) {
                // Update existing service
                const result = await supabase
                    .from('external_services')
                    .update(serviceData)
                    .eq('id', initialData.id)
                error = result.error
            } else {
                // Insert new service
                const result = await supabase
                    .from('external_services')
                    .insert(serviceData)
                error = result.error
            }

            if (error) throw error

            toast({
                title: initialData ? "Service updated" : "Service added",
                description: initialData
                    ? "The external service has been successfully updated."
                    : "The external service has been successfully added.",
            })

            setOpen(false)
            resetForm()
            onSuccess()
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || `Failed to ${initialData ? 'update' : 'add'} service.`,
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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Service
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit' : 'Add'} External Service</DialogTitle>
                    <DialogDescription>
                        {initialData ? 'Update' : 'Store'} credentials for external services used by your brand.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Service Name *</Label>
                        <Input
                            id="name"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Canva, Zapier"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                            id="website"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email / Username</Label>
                            <Input
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                type="text" // Plain text as requested
                                placeholder="Stored as plain text"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="subscription">Subscription</Label>
                            <Input
                                id="subscription"
                                value={subscription}
                                onChange={(e) => setSubscription(e.target.value)}
                                placeholder="e.g. Pro, Enterprise"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Price</Label>
                            <Input
                                id="price"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="e.g. $29/mo"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="api">API Key (if applicable)</Label>
                        <Input
                            id="api"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="font-mono text-sm"
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {initialData ? 'Update' : 'Save'} Service
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
