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
import { Copy, Trash2, Globe, Key, Eye, EyeOff, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
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
        try {
            const { error } = await supabase
                .from('external_services')
                .delete()
                .eq('id', id)

            if (error) throw error

            toast.success("Service deleted")
            setDeletingId(null)
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

    const panelClass = "rounded-2xl border border-white/10 bg-[#151620] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_46px_rgba(0,0,0,0.22)] overflow-hidden"
    const subtleBtn = "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
    const iconBtn = "h-8 w-8 p-0 border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white/90">External Services</h3>
                    <p className="text-sm text-white/45">Store credentials and subscriptions used by your workflows and team.</p>
                </div>
                <AddServiceForm workspaceId={workspaceId} onSuccess={fetchServices} />
            </div>

            <div className={panelClass}>
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-white/55">Service</TableHead>
                            <TableHead className="text-white/55">Credentials</TableHead>
                            <TableHead className="text-white/55">Subscription</TableHead>
                            <TableHead className="text-white/55">API Key</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-white/45">
                                    {isLoading ? "Loading services..." : "No external services added yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            services.map((service) => (
                                <TableRow key={service.id} className="border-white/5 hover:bg-white/[0.02]">
                                    <TableCell>
                                        <div className="font-medium text-white/90">{service.service_name}</div>
                                        {service.website && (
                                            <a
                                                href={service.website.startsWith('http') ? service.website : `https://${service.website}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 flex items-center text-xs text-cyan-200/70 hover:text-cyan-200"
                                            >
                                                <Globe className="h-3 w-3 mr-1" />
                                                Visit Website
                                            </a>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-2 text-sm text-white/80">
                                            {service.email && (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-8 text-xs uppercase text-white/40">User</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="max-w-[150px] truncate rounded border border-white/10 bg-[#1b1d28] px-2 py-1 text-white/80">
                                                            {service.email}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title="Copy email"
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white active:scale-90"
                                                            onClick={() => copyToClipboard(service.email, "Email")}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {service.password && (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-8 text-xs uppercase text-white/40">Pass</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="rounded border border-white/10 bg-[#1b1d28] px-2 py-1 font-mono text-white/80">
                                                            {showPassword[service.id] ? service.password : "••••••••"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title="Toggle visibility"
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white active:scale-90"
                                                            onClick={() => togglePasswordVisibility(service.id)}
                                                        >
                                                            {showPassword[service.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Copy password"
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white active:scale-90"
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
                                            {service.subscription_tier && <div className="font-medium text-white/85">{service.subscription_tier}</div>}
                                            {service.price && <div className="text-xs text-white/45">{service.price}</div>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {service.api_key && (
                                            <div className="flex items-center gap-1">
                                                <Key className="h-3 w-3 text-amber-200/70" />
                                                <span className="text-xs font-mono text-white/45">configured</span>
                                                <button
                                                    type="button"
                                                    title="Copy API key"
                                                    className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 transition-transform hover:bg-white/10 hover:text-white active:scale-90"
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
                                                    <Button variant="ghost" size="sm" className={iconBtn}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 border border-red-300/15 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
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
                <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete external service?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            This action cannot be undone. This will permanently delete the service credentials from your account.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={subtleBtn}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingId && handleDelete(deletingId)}
                            className="border border-red-300/15 bg-red-500/15 text-red-100 hover:bg-red-500/20"
                        >
                            {deletingId ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Delete
                                </>
                            ) : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
