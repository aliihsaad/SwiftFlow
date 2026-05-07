"use client"

import { useState } from "react"
import Image from "next/image"
import { Automation } from "@/types/automation"
import type { WorkflowNode, WorkflowNodeData } from "@/types/automation-graph"
import { Switch } from "@/components/ui/switch"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
    MoreVertical,
    MessageCircle,
    Send,
    Edit2,
    Trash2,
    Hash,
    Zap,
    Layers,
    Activity,
    Loader2,
} from "lucide-react"

const AUTO_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.05)',
    muted: 'rgba(255,255,255,0.45)',
    mutedSoft: 'rgba(255,255,255,0.35)',
}

interface ActiveAutomationsListProps {
    automations: Automation[]
    onEdit: (automation: Automation) => void
    onToggle: (automationId: string, isActive: boolean) => void
    onDelete: (automationId: string) => Promise<void> | void
    togglingAutomationIds?: string[]
    deletingAutomationIds?: string[]
    readOnly?: boolean
}

type PlatformLabel = 'Instagram' | 'Facebook' | 'Meta'

function isGraphBackedWizard(automation: Automation): boolean {
    return automation.editor_version === 'wizard' && !!automation.workflow_graph
}

function isGraphAutomation(automation: Automation): boolean {
    return automation.editor_version === 'canvas' || isGraphBackedWizard(automation)
}

function getGraphNodes(automation: Automation): WorkflowNode[] {
    return (automation.workflow_graph?.nodes ?? []) as WorkflowNode[]
}

function getGraphTriggerNode(automation: Automation): WorkflowNode | undefined {
    return getGraphNodes(automation).find((node) => {
        const type = (node.data as WorkflowNodeData | undefined)?.type
        return typeof type === 'string' && type.startsWith('trigger_')
    })
}

function getGraphActionNodes(automation: Automation): WorkflowNode[] {
    return getGraphNodes(automation).filter((node) => {
        const type = (node.data as WorkflowNodeData | undefined)?.type
        return typeof type === 'string' && type.startsWith('action_')
    })
}

function getAutomationPlatformLabel(automation: Automation): PlatformLabel {
    if (isGraphAutomation(automation)) {
        const triggerNode = getGraphTriggerNode(automation)
        const config = (triggerNode?.data as WorkflowNodeData | undefined)?.config as unknown as Record<string, unknown> | undefined
        const platform = typeof config?.platform === 'string' ? config.platform : null
        if (platform === 'facebook') return 'Facebook'
        if (platform === 'instagram') return 'Instagram'
        return 'Meta'
    }

    // Legacy wizard automations are currently Instagram-only in this app.
    return 'Instagram'
}

function getPlatformChipStyles(platform: PlatformLabel) {
    if (platform === 'Facebook') {
        return {
            background: 'rgba(56,189,248,0.12)',
            color: '#dff6ff',
            border: '1px solid rgba(56,189,248,0.24)',
        }
    }
    if (platform === 'Instagram') {
        return {
            background: 'rgba(251,113,133,0.12)',
            color: '#ffe4ea',
            border: '1px solid rgba(251,113,133,0.24)',
        }
    }
    return {
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
    }
}

function getWizardTriggerSummary(automation: Automation): string {
    if (automation.trigger_config?.trigger_type === 'keywords') {
        const count = automation.trigger_config.keywords?.length || 0
        return `Comment keywords (${count})`
    }
    return 'Any comment'
}

function getGraphTriggerSummary(automation: Automation): string {
    const triggerNode = getGraphTriggerNode(automation)
    if (!triggerNode) return 'Trigger not configured'

    const data = (triggerNode.data ?? {}) as WorkflowNodeData
    const config = (data.config ?? {}) as unknown as Record<string, unknown>

    switch (data.type) {
        case 'trigger_new_comment': {
            const triggerType = config.trigger_type === 'keywords' ? 'keywords' : 'any'
            if (triggerType === 'keywords') {
                const keywords = Array.isArray(config.keywords) ? config.keywords.length : 0
                return `New comment (keywords: ${keywords})`
            }
            return 'New comment (any)'
        }
        case 'trigger_new_message': {
            const triggerType = config.trigger_type === 'keywords' ? 'keywords' : 'any'
            if (triggerType === 'keywords') {
                const keywords = Array.isArray(config.keywords) ? config.keywords.length : 0
                return `New message (keywords: ${keywords})`
            }
            return 'New message (any)'
        }
        case 'trigger_cron':
            return `Schedule (${typeof config.schedule === 'string' ? config.schedule : 'custom'})`
        case 'trigger_new_follower':
            return 'New follower'
        case 'trigger_story_mention':
            return 'Story mention'
        case 'trigger_story_reply':
            return 'Story reply'
        default:
            return data.label || 'Trigger'
    }
}

function getAutomationTriggerSummary(automation: Automation): string {
    return isGraphAutomation(automation)
        ? getGraphTriggerSummary(automation)
        : getWizardTriggerSummary(automation)
}

function getWizardActionSummary(automation: Automation): string {
    const parts: string[] = []
    if (automation.comment_reply_config?.enabled) {
        parts.push('Reply to comment')
    }
    if (automation.dm_config?.opening_message || automation.dm_config?.link_url || automation.dm_config?.link_message) {
        parts.push('Send DM')
    }
    return parts.length ? parts.join(' • ') : 'No actions configured'
}

function getGraphActionSummary(automation: Automation): string {
    const actionNodes = getGraphActionNodes(automation)
    if (!actionNodes.length) return 'No actions configured'

    const labels = actionNodes
        .map((node) => ((node.data ?? {}) as WorkflowNodeData).label || 'Action')
        .filter(Boolean)

    const preview = labels.slice(0, 3)
    const suffix = labels.length > 3 ? ` +${labels.length - 3} more` : ''
    return `${preview.join(' • ')}${suffix}`
}

function getAutomationActionSummary(automation: Automation): string {
    return isGraphAutomation(automation)
        ? getGraphActionSummary(automation)
        : getWizardActionSummary(automation)
}

function automationUsesSendDM(automation: Automation): boolean {
    if (!isGraphAutomation(automation)) return true
    return getGraphActionNodes(automation).some((node) => {
        const type = ((node.data ?? {}) as WorkflowNodeData).type
        return type === 'action_send_dm'
    })
}

export function ActiveAutomationsList({
    automations,
    onEdit,
    onToggle,
    onDelete,
    togglingAutomationIds = [],
    deletingAutomationIds = [],
    readOnly = false,
}: ActiveAutomationsListProps) {
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)
    const togglingSet = new Set(togglingAutomationIds)
    const deletingSet = new Set(deletingAutomationIds)

    const handleDeleteConfirm = async () => {
        if (deleteConfirmId) {
            setIsDeleteSubmitting(true)
            try {
                await onDelete(deleteConfirmId)
                setDeleteConfirmId(null)
            } catch {
                // Toast feedback is handled by the parent page.
            } finally {
                setIsDeleteSubmitting(false)
            }
        }
    }

    return (
        <>
            <div className="space-y-3">
                {automations.map((automation) => (
                    (() => {
                        const isCanvas = automation.editor_version === 'canvas'
                        const isGraphWizard = isGraphBackedWizard(automation)
                        const isGraph = isGraphAutomation(automation)
                        const platformLabel = getAutomationPlatformLabel(automation)
                        const platformChipStyles = getPlatformChipStyles(platformLabel)
                        const triggerSummary = getAutomationTriggerSummary(automation)
                        const actionSummary = getAutomationActionSummary(automation)
                        const hasDMAction = automationUsesSendDM(automation)
                        const graphNodeCount = isGraph ? (automation.workflow_graph?.nodes?.length || 0) : 0
                        const graphActionCount = isGraph ? getGraphActionNodes(automation).length : 0
                        const isToggling = togglingSet.has(automation.id)
                        const isDeleting = deletingSet.has(automation.id)
                        const isDraftWizard = isGraphWizard && !automation.is_active
                        const statusLabel = isDraftWizard
                            ? 'Draft'
                            : automation.is_active
                                ? 'Active'
                                : 'Paused'
                        const statusStyles = automation.is_active
                            ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                            : isDraftWizard
                                ? { background: 'rgba(245,158,11,0.10)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.2)' }
                                : { background: 'rgba(255,255,255,0.05)', color: AUTO_THEME.mutedSoft, border: `1px solid ${AUTO_THEME.border}` }
                        const editorBadge = isCanvas ? 'Canvas' : isGraphWizard ? 'Graph Wizard' : 'Wizard'

                        return (
                            <div
                                key={automation.id}
                                className="overflow-hidden rounded-xl transition-all duration-200"
                                style={{
                                    background: AUTO_THEME.panel,
                                    border: automation.is_active
                                        ? '1px solid rgba(74,222,128,0.22)'
                                        : `1px solid ${AUTO_THEME.border}`,
                                    boxShadow: automation.is_active
                                        ? '0 8px 28px rgba(74,222,128,0.08)'
                                        : '0 4px 20px rgba(0,0,0,0.18)',
                                }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-stretch">
                            {/* Post Thumbnail */}
                            <div
                                className="relative w-full sm:w-24 h-28 sm:h-auto shrink-0 overflow-hidden"
                                style={{ background: AUTO_THEME.panelAlt, borderRight: `1px solid ${AUTO_THEME.borderSoft}` }}
                            >
                                {automation.post_thumbnail_url ? (
                                    <Image
                                        src={automation.post_thumbnail_url}
                                        alt={automation.name}
                                        fill
                                        unoptimized
                                        sizes="96px"
                                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <Zap className="h-7 w-7" style={{ color: 'rgba(255,255,255,0.16)' }} />
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                                <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                                            <h3
                                                className="font-semibold text-sm truncate"
                                                style={{ color: 'rgba(255,255,255,0.85)' }}
                                            >
                                                {automation.name}
                                            </h3>
                                            <span
                                                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0"
                                                style={statusStyles}
                                            >
                                                {statusLabel}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span
                                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                                style={platformChipStyles}
                                            >
                                                {platformLabel}
                                            </span>
                                            <span
                                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                                style={{ background: 'rgba(245,158,11,0.10)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.2)' }}
                                            >
                                                {editorBadge}
                                            </span>
                                        </div>

                                        <div
                                            className="space-y-1 text-xs"
                                            style={{ color: AUTO_THEME.muted }}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#38bdf8' }} />
                                                <span className="truncate">
                                                    Trigger: <span style={{ color: 'rgba(255,255,255,0.72)' }}>{triggerSummary}</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: '#f59e0b' }} />
                                                <span className="truncate">
                                                    Actions: <span style={{ color: 'rgba(255,255,255,0.72)' }}>{actionSummary}</span>
                                                </span>
                                            </div>
                                        </div>

                                        <div
                                            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-2"
                                            style={{ color: AUTO_THEME.mutedSoft }}
                                        >
                                            <span className="flex items-center gap-1">
                                                <Activity className="h-3 w-3" style={{ color: '#4ade80' }} />
                                                {automation.total_triggered} runs
                                            </span>

                                            {hasDMAction && (
                                                <span className="flex items-center gap-1">
                                                    <Send className="h-3 w-3" style={{ color: '#fb7185' }} />
                                                    {automation.total_dms_sent} DMs sent
                                                </span>
                                            )}

                                            {isGraph && (
                                                <span className="flex items-center gap-1">
                                                    <Zap className="h-3 w-3" style={{ color: '#f59e0b' }} />
                                                    {graphActionCount} actions
                                                </span>
                                            )}

                                            {isCanvas && (
                                                <span className="flex items-center gap-1">
                                                    <Layers className="h-3 w-3" style={{ color: '#fbbf24' }} />
                                                    {graphNodeCount} nodes
                                                </span>
                                            )}

                                            {!isGraph && automation.trigger_config?.trigger_type === 'keywords' && (
                                                <span className="flex items-center gap-1">
                                                    <Hash className="h-3 w-3" style={{ color: '#38bdf8' }} />
                                                    {automation.trigger_config.keywords?.length || 0} keywords
                                                </span>
                                            )}
                                        </div>

                                        {automation.post_caption && (
                                            <p
                                                className="text-xs mt-1.5 truncate max-w-[200px] sm:max-w-md"
                                                style={{ color: 'rgba(255,255,255,0.28)' }}
                                            >
                                                {automation.post_caption}
                                            </p>
                                        )}

                                    </div>

                                {/* Actions */}
                                    <div className="flex items-center gap-3 self-end sm:self-center">
                                        {(isToggling || isDeleting) && (
                                            <div
                                                className="flex items-center gap-1.5 text-[10px] font-semibold"
                                                style={{ color: 'rgba(255,255,255,0.45)' }}
                                            >
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                {isDeleting ? 'Deleting…' : 'Updating…'}
                                            </div>
                                        )}
                                        <Switch
                                            checked={automation.is_active}
                                            disabled={readOnly || isToggling || isDeleting}
                                            onCheckedChange={(checked) => {
                                                if (readOnly) return
                                                onToggle(automation.id, checked)
                                            }}
                                        />

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    disabled={readOnly || isDeleting}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150"
                                                    style={{ background: 'rgba(255,255,255,0.05)', color: AUTO_THEME.muted }}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                style={{ background: AUTO_THEME.panelAlt, border: `1px solid ${AUTO_THEME.border}` }}
                                            >
                                                <DropdownMenuItem
                                                    disabled={readOnly || isDeleting}
                                                    onClick={() => {
                                                        if (readOnly) return
                                                        onEdit(automation)
                                                    }}
                                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                                >
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.06)' }} />
                                                <DropdownMenuItem
                                                    disabled={readOnly || isDeleting}
                                                    onClick={() => {
                                                        if (readOnly) return
                                                        setDeleteConfirmId(automation.id)
                                                    }}
                                                    style={{ color: '#f87171' }}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )
                    })()
                ))}
            </div>

            <AlertDialog
                open={!!deleteConfirmId}
                onOpenChange={(open) => {
                    if (isDeleteSubmitting) return
                    if (!open) setDeleteConfirmId(null)
                }}
            >
                <AlertDialogContent
                    style={{ background: AUTO_THEME.panel, border: `1px solid ${AUTO_THEME.border}` }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Automation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The automation will stop processing new events immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleteSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleteSubmitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleteSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting…
                                </>
                            ) : (
                                'Delete'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
