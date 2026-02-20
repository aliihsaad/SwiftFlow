"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Zap, MessageCircle, Plus, Workflow, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AutomationCard } from "@/components/automation/automation-card"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { WorkflowCanvas } from "@/components/automation/canvas/workflow-canvas"
import { Automation } from "@/types/automation"
import { WorkflowGraph } from "@/types/automation-graph"
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

type EditorView = 'list' | 'canvas' | 'wizard'

export default function AutomationPage() {
    const [editorView, setEditorView] = useState<EditorView>('list')
    const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
    const { toast } = useToast()

    const { data, error, isLoading, mutate } = useSWR<AutomationsResponse>(
        '/api/automations',
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    // ─── Handlers ──────────────────────────────────────────────

    const handleCreateCanvas = () => {
        setEditingAutomation(null)
        setEditorView('canvas')
    }

    const handleCreateWizard = () => {
        setEditingAutomation(null)
        setIsSetupModalOpen(true)
    }

    const handleEdit = (automation: Automation) => {
        setEditingAutomation(automation)
        if (automation.editor_version === 'canvas' && automation.workflow_graph) {
            setEditorView('canvas')
        } else {
            setIsSetupModalOpen(true)
        }
    }

    const handleToggle = async (automationId: string, isActive: boolean) => {
        try {
            const response = await fetch(`/api/automations/${automationId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive })
            })

            if (!response.ok) throw new Error('Failed to toggle automation')

            toast({
                title: isActive ? "Automation enabled" : "Automation paused",
                description: isActive
                    ? "Your automation is now active and will process new events."
                    : "Your automation has been paused.",
            })

            mutate()
        } catch {
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

            if (!response.ok) throw new Error('Failed to delete automation')

            toast({
                title: "Automation deleted",
                description: "Your automation has been removed.",
            })

            mutate()
        } catch {
            toast({
                title: "Error",
                description: "Failed to delete automation.",
                variant: "destructive",
            })
        }
    }

    const handleWizardSave = () => {
        setIsSetupModalOpen(false)
        setEditingAutomation(null)
        mutate()
    }

    const handleCanvasSave = useCallback(async (graph: WorkflowGraph, name: string, isActive: boolean) => {
        const isEditing = !!editingAutomation?.id

        const body: Record<string, unknown> = {
            workflow_graph: graph,
            editor_version: 'canvas',
            name,
            is_active: isActive,
        }

        // Extract social_account_id from trigger node
        const triggerNode = graph.nodes.find(n => n.data?.type?.startsWith('trigger_'))
        const config = triggerNode?.data?.config as Record<string, unknown> | undefined
        if (config?.social_account_id) {
            body.social_account_id = config.social_account_id
        }

        const url = isEditing
            ? `/api/automations/${editingAutomation.id}`
            : '/api/automations'
        const method = isEditing ? 'PUT' : 'POST'

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Failed to save')
        }

        mutate()
    }, [editingAutomation, mutate])

    const handleCanvasBack = () => {
        setEditorView('list')
        setEditingAutomation(null)
    }

    // ─── Canvas Editor (Full-Screen) ───────────────────────────

    if (editorView === 'canvas') {
        return (
            <div className="h-[calc(100vh-4rem)] -m-6">
                <WorkflowCanvas
                    automationId={editingAutomation?.id}
                    automationName={editingAutomation?.name || 'New Automation'}
                    isActive={editingAutomation?.is_active ?? true}
                    initialGraph={editingAutomation?.workflow_graph}
                    onSave={handleCanvasSave}
                    onBack={handleCanvasBack}
                />
            </div>
        )
    }

    // ─── List View ─────────────────────────────────────────────

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
                        <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500" />
                        Automation
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Automate your Instagram engagement with smart triggers and actions.
                    </p>
                </div>
            </div>

            {/* Create New Automation */}
            <div>
                <h2 className="text-lg font-medium mb-4">Create New Automation</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <AutomationCard
                        icon={Workflow}
                        title="Visual Workflow Builder"
                        description="Build complex automations with a drag-and-drop canvas. Chain triggers, conditions, delays, and actions for powerful multi-step flows."
                        onClick={handleCreateCanvas}
                        badge="New"
                    />
                    <AutomationCard
                        icon={MessageCircle}
                        title="Comment Automation"
                        description="Quick setup: automatically reply to comments and optionally send a DM with a link. Great for lead magnets."
                        onClick={handleCreateWizard}
                        badge="Simple"
                    />
                </div>
            </div>

            {/* Active Automations */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium">Active Automations</h2>
                    {data?.automations && data.automations.length > 0 && (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleCreateCanvas}>
                                <Workflow className="h-4 w-4 mr-2" />
                                Canvas
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCreateWizard}>
                                <Plus className="h-4 w-4 mr-2" />
                                Simple
                            </Button>
                        </div>
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
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-8 sm:p-12 text-center">
                        <Zap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground font-medium">No automations yet</p>
                        <p className="text-sm text-muted-foreground mt-2 mb-4">
                            Create your first automation to start engaging with your audience automatically.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <Button onClick={handleCreateCanvas}>
                                <Workflow className="h-4 w-4 mr-2" />
                                Visual Builder
                            </Button>
                            <Button variant="outline" onClick={handleCreateWizard}>
                                <ListChecks className="h-4 w-4 mr-2" />
                                Simple Setup
                            </Button>
                        </div>
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

            {/* Wizard Setup Modal (Simple Mode) */}
            <AutomationSetupModal
                open={isSetupModalOpen}
                onOpenChange={setIsSetupModalOpen}
                automation={editingAutomation}
                onSave={handleWizardSave}
            />
        </div>
    )
}
