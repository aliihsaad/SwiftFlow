"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { AutomationCommandCenter } from "@/components/automation/automation-command-center"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { AutomationTemplatePicker } from "@/components/automation/automation-template-picker"
import { AutomationRunsDialog } from "@/components/automation/automation-runs-dialog"
import { WorkflowCanvas } from "@/components/automation/canvas/workflow-canvas"
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

export default function AutomationPage() {
    const [editorView, setEditorView] = useState<EditorView>('list')
    const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
    const [canvasTemplateGraph, setCanvasTemplateGraph] = useState<WorkflowGraph | undefined>(undefined)
    const [canvasTemplateName, setCanvasTemplateName] = useState<string | null>(null)
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
    const [togglingAutomationIds, setTogglingAutomationIds] = useState<string[]>([])
    const [deletingAutomationIds, setDeletingAutomationIds] = useState<string[]>([])
    const [runsAutomation, setRunsAutomation] = useState<Automation | null>(null)
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

    if (editorView === 'canvas') {
        return (
            <div className="-m-4 h-full min-h-0 overflow-hidden sm:-m-5 lg:-m-8">
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

    return (
        <>
            <AutomationCommandCenter
                automations={data?.automations ?? []}
                error={error instanceof Error ? error : undefined}
                initialLoading={showInitialLoading}
                refreshing={showRefreshingHint}
                canWrite={canWriteAutomations}
                togglingAutomationIds={togglingAutomationIds}
                deletingAutomationIds={deletingAutomationIds}
                onCreateBlank={handleCreateCanvas}
                onOpenTemplates={handleOpenTemplatePicker}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onViewRuns={setRunsAutomation}
            />

            <AutomationTemplatePicker
                open={canWriteAutomations && isTemplatePickerOpen}
                onOpenChange={setIsTemplatePickerOpen}
                onSelectTemplate={handleApplyTemplate}
            />

            <AutomationRunsDialog
                automation={runsAutomation}
                open={!!runsAutomation}
                onOpenChange={(open) => {
                    if (!open) setRunsAutomation(null)
                }}
                canReplay={canWriteAutomations}
            />

            <AutomationSetupModal
                key={isSetupModalOpen ? (editingAutomation?.id ?? "new") : "closed"}
                open={canWriteAutomations && isSetupModalOpen}
                onOpenChange={setIsSetupModalOpen}
                automation={editingAutomation}
                onSave={handleWizardSave}
            />
        </>
    )
}
