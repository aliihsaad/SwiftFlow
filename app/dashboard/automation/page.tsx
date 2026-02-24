"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Zap, MessageCircle, Plus, Workflow, ListChecks, Sparkles } from "lucide-react"
import { AutomationCard } from "@/components/automation/automation-card"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { AutomationTemplatePicker } from "@/components/automation/automation-template-picker"
import { WorkflowCanvas } from "@/components/automation/canvas/workflow-canvas"
import { Automation } from "@/types/automation"
import { WorkflowGraph } from "@/types/automation-graph"
import { useToast } from "@/components/ui/use-toast"
import type { AutomationTemplateDefinition } from "@/lib/automation-templates"

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
    const [canvasTemplateGraph, setCanvasTemplateGraph] = useState<WorkflowGraph | undefined>(undefined)
    const [canvasTemplateName, setCanvasTemplateName] = useState<string | null>(null)
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
    const [togglingAutomationIds, setTogglingAutomationIds] = useState<string[]>([])
    const [deletingAutomationIds, setDeletingAutomationIds] = useState<string[]>([])
    const { toast } = useToast()

    const { data, error, isLoading, mutate } = useSWR<AutomationsResponse>(
        '/api/automations',
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const resetCanvasDraftSeed = () => {
        setCanvasTemplateGraph(undefined)
        setCanvasTemplateName(null)
    }

    const handleCreateCanvas = () => {
        setEditingAutomation(null)
        resetCanvasDraftSeed()
        setEditorView('canvas')
    }

    const handleOpenTemplatePicker = () => {
        setEditingAutomation(null)
        resetCanvasDraftSeed()
        setIsTemplatePickerOpen(true)
    }

    const handleApplyTemplate = (template: AutomationTemplateDefinition) => {
        setEditingAutomation(null)
        setCanvasTemplateGraph(template.buildGraph())
        setCanvasTemplateName(template.name)
        setIsTemplatePickerOpen(false)
        setEditorView('canvas')
    }

    const handleCreateWizard = () => {
        setEditingAutomation(null)
        resetCanvasDraftSeed()
        setIsSetupModalOpen(true)
    }

    const handleEdit = (automation: Automation) => {
        setEditingAutomation(automation)
        resetCanvasDraftSeed()
        if (automation.editor_version === 'canvas' && automation.workflow_graph) {
            setEditorView('canvas')
        } else {
            setIsSetupModalOpen(true)
        }
    }

    const handleToggle = async (automationId: string, isActive: boolean) => {
        setTogglingAutomationIds((prev) => (prev.includes(automationId) ? prev : [...prev, automationId]))
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
            toast({ title: "Error", description: "Failed to update automation status.", variant: "destructive" })
        } finally {
            setTogglingAutomationIds((prev) => prev.filter((id) => id !== automationId))
        }
    }

    const handleDelete = async (automationId: string) => {
        setDeletingAutomationIds((prev) => (prev.includes(automationId) ? prev : [...prev, automationId]))
        try {
            const response = await fetch(`/api/automations/${automationId}`, { method: 'DELETE' })
            if (!response.ok) throw new Error('Failed to delete automation')
            toast({ title: "Automation deleted", description: "Your automation has been removed." })
            mutate()
        } catch {
            toast({ title: "Error", description: "Failed to delete automation.", variant: "destructive" })
            throw new Error('Failed to delete automation')
        } finally {
            setDeletingAutomationIds((prev) => prev.filter((id) => id !== automationId))
        }
    }

    const handleWizardSave = () => { setIsSetupModalOpen(false); setEditingAutomation(null); mutate() }

    const handleCanvasSave = useCallback(async (graph: WorkflowGraph, name: string, isActive: boolean) => {
        const isEditing = !!editingAutomation?.id
        const body: Record<string, unknown> = {
            workflow_graph: graph,
            editor_version: 'canvas',
            name,
            is_active: isActive,
        }
        const triggerNode = graph.nodes.find(n => n.data?.type?.startsWith('trigger_'))
        const config = triggerNode?.data?.config as Record<string, unknown> | undefined
        if (config?.social_account_id) body.social_account_id = config.social_account_id

        const url = isEditing ? `/api/automations/${editingAutomation.id}` : '/api/automations'
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
        resetCanvasDraftSeed()
        mutate()
    }, [editingAutomation, mutate])

    // Canvas editor (full-screen)
    if (editorView === 'canvas') {
        return (
            <div className="h-[calc(100vh-4rem)] -m-6">
                <WorkflowCanvas
                    automationId={editingAutomation?.id}
                    automationName={editingAutomation?.name || canvasTemplateName || 'New Automation'}
                    isActive={editingAutomation?.is_active ?? true}
                    initialGraph={editingAutomation?.workflow_graph || canvasTemplateGraph}
                    onSave={handleCanvasSave}
                    onBack={() => {
                        setEditorView('list')
                        setEditingAutomation(null)
                        resetCanvasDraftSeed()
                    }}
                />
            </div>
        )
    }

    // List view
    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1
                        className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                        <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{ background: 'rgba(251,191,36,0.12)' }}
                        >
                            <Zap className="h-4 w-4" style={{ color: '#fbbf24' }} />
                        </div>
                        Automation
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Automate your Instagram and Facebook engagement with smart triggers and actions.
                    </p>
                </div>
            </div>

            {/* Create New */}
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Create New Automation
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <AutomationCard
                        icon={Workflow}
                        title="Visual Workflow Builder"
                        description="Build complex automations with a drag-and-drop canvas. Chain triggers, conditions, delays, and actions for powerful multi-step flows."
                        onClick={handleCreateCanvas}
                        badge="New"
                    />
                    <AutomationCard
                        icon={Sparkles}
                        title="Automation Templates"
                        description="Start from prebuilt canvas workflows for comment and message automations, then customize them for Instagram or Facebook."
                        onClick={handleOpenTemplatePicker}
                        badge="Templates"
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
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Active Automations
                    </h2>
                    {data?.automations && data.automations.length > 0 && (
                        <div className="flex gap-2">
                            <button
                                onClick={handleOpenTemplatePicker}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Template
                            </button>
                            <button
                                onClick={handleCreateCanvas}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                            >
                                <Workflow className="h-3.5 w-3.5" />
                                Canvas
                            </button>
                            <button
                                onClick={handleCreateWizard}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Simple
                            </button>
                        </div>
                    )}
                </div>

                {/* Loading */}
                {isLoading && (
                    <div
                        className="rounded-xl p-8 text-center"
                        style={{ background: '#0e0d1c', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        <div className="flex flex-col items-center gap-3">
                            <div
                                className="h-9 w-9 rounded-full animate-pulse"
                                style={{ background: 'rgba(255,255,255,0.06)' }}
                            />
                            <div
                                className="h-3 w-28 rounded animate-pulse"
                                style={{ background: 'rgba(255,255,255,0.05)' }}
                            />
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div
                        className="rounded-xl p-6 text-center"
                        style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                    >
                        <p className="font-medium" style={{ color: '#f87171' }}>Failed to load automations</p>
                        <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Please try again later</p>
                    </div>
                )}

                {/* Empty state */}
                {data?.automations && data.automations.length === 0 && !isLoading && (
                    <div
                        className="rounded-xl p-8 sm:p-12 text-center"
                        style={{ background: '#0e0d1c', border: '1px dashed rgba(139,92,246,0.2)' }}
                    >
                        <div
                            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                            style={{ background: 'rgba(251,191,36,0.08)', boxShadow: '0 0 32px rgba(251,191,36,0.08)' }}
                        >
                            <Zap className="h-8 w-8" style={{ color: '#fbbf24' }} />
                        </div>
                        <p className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>No automations yet</p>
                        <p className="text-sm mt-2 mb-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Create your first automation to start engaging with your audience automatically.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={handleOpenTemplatePicker}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}
                            >
                                <Sparkles className="h-4 w-4" />
                                Templates
                            </button>
                            <button
                                onClick={handleCreateCanvas}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    color: '#fff',
                                    boxShadow: '0 2px 16px rgba(139,92,246,0.3)',
                                }}
                            >
                                <Workflow className="h-4 w-4" />
                                Visual Builder
                            </button>
                            <button
                                onClick={handleCreateWizard}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}
                            >
                                <ListChecks className="h-4 w-4" />
                                Simple Setup
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                {data?.automations && data.automations.length > 0 && (
                        <ActiveAutomationsList
                            automations={data.automations}
                            onEdit={handleEdit}
                            onToggle={handleToggle}
                            onDelete={handleDelete}
                            togglingAutomationIds={togglingAutomationIds}
                            deletingAutomationIds={deletingAutomationIds}
                        />
                )}
            </div>

            <AutomationTemplatePicker
                open={isTemplatePickerOpen}
                onOpenChange={setIsTemplatePickerOpen}
                onSelectTemplate={handleApplyTemplate}
            />

            {/* Wizard modal */}
            <AutomationSetupModal
                open={isSetupModalOpen}
                onOpenChange={setIsSetupModalOpen}
                automation={editingAutomation}
                onSave={handleWizardSave}
            />
        </div>
    )
}
