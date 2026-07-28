"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Eye, EyeOff, Globe, Key, Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AddServiceForm } from "./add-service-form"
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

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

interface ExternalServicesListProps {
    workspaceId: string
}

type SecretField = "password" | "api_key"

export function ExternalServicesList({ workspaceId }: ExternalServicesListProps) {
    const [services, setServices] = useState<ExternalService[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
    const [credentialLoading, setCredentialLoading] = useState<Record<string, boolean>>({})
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const fetchServices = useCallback(async () => {
        setIsLoading(true)
        setRevealedPasswords({})
        try {
            const response = await fetch(`/api/external-services?workspaceId=${encodeURIComponent(workspaceId)}`, {
                cache: "no-store",
            })
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload?.error || "Failed to fetch external services")
            }
            const data = await response.json()
            setServices(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error("Error fetching services:", error)
            toast.error(error instanceof Error ? error.message : "Failed to load external services")
        } finally {
            setIsLoading(false)
        }
    }, [workspaceId])

    useEffect(() => {
        fetchServices()
    }, [fetchServices])

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/external-services/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
                method: "DELETE",
            })
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload?.error || "Failed to delete service")
            }

            toast.success("Service deleted")
            setDeletingId(null)
            fetchServices()
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to delete service")
        }
    }

    const fetchCredential = async (id: string, field: SecretField): Promise<string | null> => {
        const loadingKey = `${id}:${field}`
        setCredentialLoading((previous) => ({ ...previous, [loadingKey]: true }))
        try {
            const response = await fetch(`/api/external-services/${id}/reveal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ workspaceId, field }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload?.error || "Failed to reveal credential")
            return typeof payload?.value === "string" ? payload.value : null
        } finally {
            setCredentialLoading((previous) => ({ ...previous, [loadingKey]: false }))
        }
    }

    const togglePasswordVisibility = async (service: ExternalService) => {
        if (revealedPasswords[service.id]) {
            setRevealedPasswords((previous) => {
                const next = { ...previous }
                delete next[service.id]
                return next
            })
            return
        }

        try {
            const value = await fetchCredential(service.id, "password")
            if (!value) {
                toast.error("No password is stored for this service")
                return
            }
            setRevealedPasswords((previous) => ({ ...previous, [service.id]: value }))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to reveal password")
        }
    }

    const copyText = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`${label} copied to clipboard`)
        } catch (error) {
            console.error("Failed to copy:", error)
            toast.error("Unable to copy to clipboard")
        }
    }

    const copyCredential = async (service: ExternalService, field: SecretField, label: string) => {
        try {
            const cachedPassword = field === "password" ? revealedPasswords[service.id] : null
            const value = cachedPassword || await fetchCredential(service.id, field)
            if (!value) {
                toast.error(`No ${label.toLowerCase()} is stored for this service`)
                return
            }
            await copyText(value, label)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Failed to copy ${label.toLowerCase()}`)
        }
    }

    const panelClass = "rounded-2xl border border-white/10 bg-[#151620] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_46px_rgba(0,0,0,0.22)] overflow-hidden"
    const subtleBtn = "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
    const iconBtn = "h-8 w-8 p-0 border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white/90">External Services</h3>
                    <p className="text-sm text-white/45">Credentials stay encrypted and are revealed only when you explicitly request them.</p>
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
                            <TableHead className="w-[100px]" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-white/45">
                                    {isLoading ? "Loading services..." : "No external services added yet."}
                                </TableCell>
                            </TableRow>
                        ) : services.map((service) => {
                            const revealedPassword = revealedPasswords[service.id]
                            const passwordLoading = credentialLoading[`${service.id}:password`] === true
                            const apiKeyLoading = credentialLoading[`${service.id}:api_key`] === true

                            return (
                                <TableRow key={service.id} className="border-white/5 hover:bg-white/[0.02]">
                                    <TableCell>
                                        <div className="font-medium text-white/90">{service.service_name}</div>
                                        {service.website && (
                                            <a
                                                href={service.website.startsWith("http") ? service.website : `https://${service.website}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 flex items-center text-xs text-cyan-200/70 hover:text-cyan-200"
                                            >
                                                <Globe className="mr-1 h-3 w-3" />
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
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                                                            onClick={() => copyText(service.email!, "Email")}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {service.has_password && (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-8 text-xs uppercase text-white/40">Pass</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="max-w-[180px] truncate rounded border border-white/10 bg-[#1b1d28] px-2 py-1 font-mono text-white/80">
                                                            {revealedPassword || "••••••••"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title={revealedPassword ? "Hide password" : "Reveal password"}
                                                            disabled={passwordLoading}
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
                                                            onClick={() => togglePasswordVisibility(service)}
                                                        >
                                                            {passwordLoading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : revealedPassword
                                                                    ? <EyeOff className="h-3.5 w-3.5" />
                                                                    : <Eye className="h-3.5 w-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Copy password"
                                                            disabled={passwordLoading}
                                                            className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
                                                            onClick={() => copyCredential(service, "password", "Password")}
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
                                        {service.has_api_key && (
                                            <div className="flex items-center gap-1">
                                                <Key className="h-3 w-3 text-amber-200/70" />
                                                <span className="text-xs font-mono text-white/45">configured</span>
                                                <button
                                                    type="button"
                                                    title="Copy API key"
                                                    disabled={apiKeyLoading}
                                                    className="rounded border border-white/10 bg-white/5 p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
                                                    onClick={() => copyCredential(service, "api_key", "API Key")}
                                                >
                                                    {apiKeyLoading
                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        : <Copy className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
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
                                                className="h-8 w-8 border border-red-300/15 bg-red-500/10 p-0 text-red-200 hover:bg-red-500/15 hover:text-red-100"
                                                onClick={() => setDeletingId(service.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
                <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete external service?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            This permanently deletes the service and its encrypted credentials.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={subtleBtn}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingId && handleDelete(deletingId)}
                            className="border border-red-300/15 bg-red-500/15 text-red-100 hover:bg-red-500/20"
                        >
                            {deletingId ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Delete</> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
