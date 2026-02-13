"use client"

import { useState } from "react"
import useSWR from "swr"
import { Zap, MessageCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AutomationCard } from "@/components/automation/automation-card"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { Automation } from "@/types/automation"
import { useToast } from "@/components/ui/use-toast"

interface AutomationsResponse {
    automations: Automation[]
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch')
    return data
}

export default function AutomationPage() {
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
    const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
    const { toast } = useToast()

    const { data, error, isLoading, mutate } = useSWR<AutomationsResponse>(
        '/api/automations',
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    const handleCreateNew = () => {
        setEditingAutomation(null)
        setIsSetupModalOpen(true)
    }

    const handleEdit = (automation: Automation) => {
        setEditingAutomation(automation)
        setIsSetupModalOpen(true)
    }

    const handleToggle = async (automationId: string, isActive: boolean) => {
        try {
            const response = await fetch(`/api/automations/${automationId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive })
            })

            if (!response.ok) {
                throw new Error('Failed to toggle automation')
            }

            toast({
                title: isActive ? "Automation enabled" : "Automation paused",
                description: isActive
                    ? "Your automation is now active and will process new comments."
                    : "Your automation has been paused.",
            })

            mutate()
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update automation status.",
                variant: "destructive",
            })
        }
    }

    const handleDelete = async (automationId: string) => {
        try {
            const response = await fetch(`/api/automations/${automationId}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                throw new Error('Failed to delete automation')
            }

            toast({
                title: "Automation deleted",
                description: "Your automation has been removed.",
            })

            mutate()
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete automation.",
                variant: "destructive",
            })
        }
    }

    const handleSave = () => {
        setIsSetupModalOpen(false)
        setEditingAutomation(null)
        mutate()
    }

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                        <Zap className="h-6 w-6 text-yellow-500" />
                        Automation
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Automate your Instagram engagement with smart triggers and actions.
                    </p>
                </div>
            </div>

            {/* Automation Types */}
            <div>
                <h2 className="text-lg font-medium mb-4">Create New Automation</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <AutomationCard
                        icon={MessageCircle}
                        title="Auto-DM Links from Comments"
                        description="Automatically send a DM with a link to users who comment on your posts. Great for lead magnets, special offers, or exclusive content."
                        onClick={handleCreateNew}
                        badge="Popular"
                    />
                    {/* Future automation types can be added here */}
                </div>
            </div>

            {/* Active Automations */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium">Active Automations</h2>
                    {data?.automations && data.automations.length > 0 && (
                        <Button variant="outline" size="sm" onClick={handleCreateNew}>
                            <Plus className="h-4 w-4 mr-2" />
                            New Automation
                        </Button>
                    )}
                </div>

                {isLoading && (
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-8 text-center">
                        <div className="animate-pulse flex flex-col items-center gap-2">
                            <div className="h-8 w-8 bg-muted rounded-full" />
                            <div className="h-4 w-32 bg-muted rounded" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
                        <p className="text-destructive font-medium">Failed to load automations</p>
                        <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
                    </div>
                )}

                {data?.automations && data.automations.length === 0 && !isLoading && (
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-12 text-center">
                        <Zap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground font-medium">No automations yet</p>
                        <p className="text-sm text-muted-foreground mt-2 mb-4">
                            Create your first automation to start engaging with your audience automatically.
                        </p>
                        <Button onClick={handleCreateNew}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Automation
                        </Button>
                    </div>
                )}

                {data?.automations && data.automations.length > 0 && (
                    <ActiveAutomationsList
                        automations={data.automations}
                        onEdit={handleEdit}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                    />
                )}
            </div>

            {/* Setup Modal */}
            <AutomationSetupModal
                open={isSetupModalOpen}
                onOpenChange={setIsSetupModalOpen}
                automation={editingAutomation}
                onSave={handleSave}
            />
        </div>
    )
}
