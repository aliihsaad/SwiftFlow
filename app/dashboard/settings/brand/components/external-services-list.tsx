"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/utils/supabase/client"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { AddServiceForm } from "./add-service-form"
import { Copy, Trash2, Globe, Key, Eye, EyeOff, Pencil } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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

interface ExternalServicesListProps {
    workspaceId: string
}

export function ExternalServicesList({ workspaceId }: ExternalServicesListProps) {
    const [services, setServices] = useState<ExternalService[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const supabase = createClient()

    const fetchServices = useCallback(async () => {
        setIsLoading(true)
        try {
            const { data, error } = await supabase
                .from('external_services')
                .select('*')
                .eq('workspace_id', workspaceId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setServices(data || [])
        } catch (error) {
            console.error("Error fetching services:", error)
        } finally {
            setIsLoading(false)
        }
    }, [workspaceId, supabase])

    useEffect(() => {
        fetchServices()
    }, [fetchServices])

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this service?")) return

        try {
            const { error } = await supabase
                .from('external_services')
                .delete()
                .eq('id', id)

            if (error) throw error

            toast.success("Service deleted")
            fetchServices()
        } catch (error: any) {
            toast.error(error.message || "Failed to delete service")
        }
    }

    const copyToClipboard = async (text: string | null, label: string) => {
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`${label} copied to clipboard`)
        } catch (error) {
            console.error('Failed to copy:', error)
            toast.error("Unable to copy to clipboard")
        }
    }

    const togglePasswordVisibility = (id: string) => {
        setShowPassword(prev => ({
            ...prev,
            [id]: !prev[id]
        }))
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">External Services</h3>
                <AddServiceForm workspaceId={workspaceId} onSuccess={fetchServices} />
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead>Credentials</TableHead>
                            <TableHead>Subscription</TableHead>
                            <TableHead>API Key</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                    {isLoading ? "Loading services..." : "No external services added yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            services.map((service) => (
                                <TableRow key={service.id}>
                                    <TableCell>
                                        <div className="font-medium">{service.service_name}</div>
                                        {service.website && (
                                            <a
                                                href={service.website.startsWith('http') ? service.website : `https://${service.website}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-muted-foreground flex items-center hover:text-blue-500 mt-1"
                                            >
                                                <Globe className="h-3 w-3 mr-1" />
                                                Visit Website
                                            </a>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-2 text-sm">
                                            {service.email && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground text-xs uppercase w-8">User</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="bg-muted/50 px-2 py-1 rounded max-w-[150px] truncate">{service.email}</span>
                                                        <button
                                                            type="button"
                                                            title="Copy email"
                                                            className="p-1.5 hover:bg-muted rounded active:scale-90 transition-transform"
                                                            onClick={() => copyToClipboard(service.email, "Email")}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {service.password && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground text-xs uppercase w-8">Pass</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="bg-muted/50 px-2 py-1 rounded font-mono">
                                                            {showPassword[service.id] ? service.password : "••••••••"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title="Toggle visibility"
                                                            className="p-1.5 hover:bg-muted rounded active:scale-90 transition-transform"
                                                            onClick={() => togglePasswordVisibility(service.id)}
                                                        >
                                                            {showPassword[service.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Copy password"
                                                            className="p-1.5 hover:bg-muted rounded active:scale-90 transition-transform"
                                                            onClick={() => copyToClipboard(service.password, "Password")}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            {service.subscription_tier && <div className="font-medium">{service.subscription_tier}</div>}
                                            {service.price && <div className="text-muted-foreground text-xs">{service.price}</div>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {service.api_key && (
                                            <div className="flex items-center gap-1">
                                                <Key className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-xs font-mono text-muted-foreground">configured</span>
                                                <button
                                                    type="button"
                                                    title="Copy API key"
                                                    className="p-1.5 hover:bg-muted rounded active:scale-90 transition-transform"
                                                    onClick={() => copyToClipboard(service.api_key, "API Key")}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-2 justify-end">
                                            <AddServiceForm
                                                workspaceId={workspaceId}
                                                onSuccess={fetchServices}
                                                initialData={service}
                                                trigger={
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => setDeletingId(service.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the service credentials from your account.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deletingId && handleDelete(deletingId)} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
