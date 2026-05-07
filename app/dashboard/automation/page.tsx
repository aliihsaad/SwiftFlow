"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Zap, Plus, Workflow, Sparkles, ShieldAlert } from "lucide-react"
import { AutomationCard } from "@/components/automation/automation-card"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { AutomationTemplatePicker } from "@/components/automation/automation-template-picker"
import { PublishingAutomationsPanel } from "@/components/automation/publishing-automations-panel"
import { WorkflowCanvas } from "@/components/automation/canvas/workflow-canvas"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
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

type EditorView = 'list' | 'canvas'

const AUTO_PAGE_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.05)',
    text: 'rgba(255,255,255,0.9)',
    muted: 'rgba(255,255,255,0.35)',
}

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
    const canWriteAutomations = useWorkspacePermission("automation:write")

    const showReadOnlyToast = () => {
        toast({
            title: "Read-only role",
            description: "Only admins and owners can create or manage automations in this workspace.",
            variant: "destructive",
        })
    }

    const { data, error, isLoading, isValidating, mutate } = useSWR<AutomationsResponse>(
        '/api/automations',
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true }
    )
    const showInitialLoading = isLoading && !data && !error
    const showRefreshingHint = isValidating && !!data

    const resetCanvasDraftSeed = () => {
        setCanvasTemplateGraph(undefined)
        setCanvasTemplateName(null)
    }

    const handleCreateCanvas = () => {
        if (!canWriteAutomations) {
            showReadOnlyToast()
            return
        }
        setEditingAutomation(null)
        resetCanvasDraftSeed()
        setEditorView('canvas')
    }

    const handleOpenTemplatePicker = () => {
        if (!canWriteAutomations) {
            showReadOnlyToast()
            return
        }
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

    const handleEdit = (automation: Automation) => {
        if (!canWriteAutomations) {
            showReadOnlyToast()
            return
        }
        setEditingAutomation(automation)
        resetCanvasDraftSeed()
        if (automation.editor_version === 'canvas' && automation.workflow_graph) {
            setEditorView('canvas')
        } else {
            setIsSetupModalOpen(true)
        }
    }

    const handleToggle = async (automationId: string, isActive: boolean) => {
        if (!canWriteAutomations) {
            showReadOnlyToast()
            return
        }
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
        if (!canWriteAutomations) {
            showReadOnlyToast()
            return
        }
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
        if (!canWriteAutomations) {
            throw new Error('Only admins and owners can manage automations.')
        }
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
    }, [canWriteAutomations, editingAutomation, mutate])

    // Canvas editor (full-screen)
    if (editorView === 'canvas') {
        return (
            <div className="h-full min-h-0 -m-6 overflow-hidden">
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
            {!canWriteAutomations && (
                <div
                    className="rounded-xl p-4"
                    style={{
                        background: 'rgba(245,158,11,0.06)',
                        border: '1px solid rgba(245,158,11,0.18)',
                    }}
                >
                    <div className="flex items-start gap-2">
                        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
                        <div>
                            <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
                                Read-only automation access
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                You can view automation status and performance, but only admins/owners can create, edit, toggle, or delete automations.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold mb-2"
                        style={{
                            background: 'rgba(245,158,11,0.10)',
                            border: '1px solid rgba(245,158,11,0.2)',
                            color: '#fcd34d',
                        }}
                    >
                        <Zap className="h-3.5 w-3.5" />
                        Automation
                    </div>
                    <h1
                        className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5"
                        style={{ color: AUTO_PAGE_THEME.text }}
                    >
                        <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{ background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.18)' }}
                        >
                            <Zap className="h-4 w-4" style={{ color: '#67e8f9' }} />
                        </div>
                        Automation
                    </h1>
                    <p className="text-sm mt-1" style={{ color: AUTO_PAGE_THEME.muted }}>
                        Automate your Instagram and Facebook engagement with smart triggers and actions.
                    </p>
                </div>
                <button
                    onClick={handleOpenTemplatePicker}
                    disabled={!canWriteAutomations}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                        background: 'linear-gradient(135deg, #38bdf8, #fb7185)',
                        color: '#fff',
                        boxShadow: '0 2px 16px rgba(56,189,248,0.2)',
                    }}
                >
                    <Plus className="h-4 w-4" />
                    New Automation
                </button>
            </div>

            <PublishingAutomationsPanel readOnly={!canWriteAutomations} />

            {/* Canvas Templates */}
            <div>
                <div className="flex flex-col gap-1 mb-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Canvas Templates
                    </h2>
                    <p className="text-xs" style={{ color: AUTO_PAGE_THEME.muted }}>
                        Start from ready node sets, then configure the account, post, message, and AI steps on the canvas.
                    </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <AutomationCard
                        icon={Sparkles}
                        title="Start From Template"
                        description="Load a tested canvas workflow for comments, DMs, followers, or story replies, then review the nodes before saving."
                        onClick={handleOpenTemplatePicker}
                        badge="Recommended"
                        disabled={!canWriteAutomations}
                    />
                    <AutomationCard
                        icon={Workflow}
                        title="Blank Canvas"
                        description="Build a custom automation with triggers, conditions, delay, AI response, and engagement actions."
                        onClick={handleCreateCanvas}
                        badge="Advanced"
                        disabled={!canWriteAutomations}
                    />
                </div>
            </div>

            {/* Active Automations */}
            <div>
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Active Automations
                    </h2>
                    {data?.automations && data.automations.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleOpenTemplatePicker}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: AUTO_PAGE_THEME.panelAlt, border: `1px solid ${AUTO_PAGE_THEME.border}`, color: 'rgba(255,255,255,0.6)' }}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                New Automation
                            </button>
                            <button
                                onClick={handleOpenTemplatePicker}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: AUTO_PAGE_THEME.panelAlt, border: `1px solid ${AUTO_PAGE_THEME.border}`, color: 'rgba(255,255,255,0.6)' }}
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Template
                            </button>
                            <button
                                onClick={handleCreateCanvas}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                                style={{ background: AUTO_PAGE_THEME.panelAlt, border: `1px solid ${AUTO_PAGE_THEME.border}`, color: 'rgba(255,255,255,0.6)' }}
                            >
                                <Workflow className="h-3.5 w-3.5" />
                                Advanced Canvas
                            </button>
                        </div>
                    )}
                </div>

                {showRefreshingHint && (
                    <InlineLoadingHint label="Updating automations…" className="mb-3" />
                )}

                {/* Loading */}
                {showInitialLoading && (
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                key={`automation-skeleton-${index}`}
                                className="rounded-xl p-4 animate-pulse"
                                style={{ background: AUTO_PAGE_THEME.panel, border: `1px solid ${AUTO_PAGE_THEME.border}` }}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-36 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
                                            <div className="h-5 w-16 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                            <div className="h-5 w-14 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
                                        </div>
                                        <div className="h-3 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                        <div className="h-3 w-1/2 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                                        <div className="flex gap-2">
                                            <div className="h-7 w-24 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                            <div className="h-7 w-20 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }} />
                                        </div>
                                    </div>
                                    <div className="h-8 w-20 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && !showInitialLoading && (
                    <div
                        className="rounded-xl p-6 text-center"
                        style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                    >
                        <p className="font-medium" style={{ color: '#f87171' }}>Failed to load automations</p>
                        <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Please try again later</p>
                    </div>
                )}

                {/* Empty state */}
                {data?.automations && data.automations.length === 0 && !showInitialLoading && (
                    <div
                        className="rounded-xl p-8 sm:p-12 text-center"
                        style={{ background: AUTO_PAGE_THEME.panel, border: `1px dashed ${AUTO_PAGE_THEME.border}` }}
                    >
                        <div
                            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                            style={{ background: 'rgba(56,189,248,0.08)', boxShadow: '0 0 32px rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.14)' }}
                        >
                            <Zap className="h-8 w-8" style={{ color: '#67e8f9' }} />
                        </div>
                        <p className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>No automations yet</p>
                        <p className="text-sm mt-2 mb-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Create your first automation to start engaging with your audience automatically.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={handleOpenTemplatePicker}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{
                                    background: 'linear-gradient(135deg, #38bdf8, #fb7185)',
                                    color: '#fff',
                                    boxShadow: '0 2px 16px rgba(56,189,248,0.2)',
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                New Automation
                            </button>
                            <button
                                onClick={handleOpenTemplatePicker}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{ background: AUTO_PAGE_THEME.panelAlt, border: `1px solid ${AUTO_PAGE_THEME.border}`, color: 'rgba(255,255,255,0.72)' }}
                            >
                                <Sparkles className="h-4 w-4" />
                                Templates
                            </button>
                            <button
                                onClick={handleCreateCanvas}
                                disabled={!canWriteAutomations}
                                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                                style={{ background: AUTO_PAGE_THEME.panelAlt, border: `1px solid ${AUTO_PAGE_THEME.border}`, color: 'rgba(255,255,255,0.72)' }}
                            >
                                <Workflow className="h-4 w-4" />
                                Advanced Visual Builder
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
                        readOnly={!canWriteAutomations}
                    />
                )}
            </div>

            <AutomationTemplatePicker
                open={canWriteAutomations && isTemplatePickerOpen}
                onOpenChange={setIsTemplatePickerOpen}
                onSelectTemplate={handleApplyTemplate}
            />

            {/* Wizard modal */}
            <AutomationSetupModal
                open={canWriteAutomations && isSetupModalOpen}
                onOpenChange={setIsSetupModalOpen}
                automation={editingAutomation}
                onSave={handleWizardSave}
            />
        </div>
    )
}
