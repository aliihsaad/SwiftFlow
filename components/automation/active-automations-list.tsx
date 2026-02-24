"use client"

import { useState } from "react"
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
    Workflow,
    Layers,
    Activity,
    Loader2,
} from "lucide-react"

interface ActiveAutomationsListProps {
    automations: Automation[]
    onEdit: (automation: Automation) => void
    onToggle: (automationId: string, isActive: boolean) => void
    onDelete: (automationId: string) => void
    togglingAutomationIds?: string[]
}

type PlatformLabel = 'Instagram' | 'Facebook' | 'Meta'

function getCanvasNodes(automation: Automation): WorkflowNode[] {
    return (automation.workflow_graph?.nodes ?? []) as WorkflowNode[]
}

function getCanvasTriggerNode(automation: Automation): WorkflowNode | undefined {
    return getCanvasNodes(automation).find((node) => {
        const type = (node.data as WorkflowNodeData | undefined)?.type
        return typeof type === 'string' && type.startsWith('trigger_')
    })
}

function getCanvasActionNodes(automation: Automation): WorkflowNode[] {
    return getCanvasNodes(automation).filter((node) => {
        const type = (node.data as WorkflowNodeData | undefined)?.type
        return typeof type === 'string' && type.startsWith('action_')
    })
}

function getAutomationPlatformLabel(automation: Automation): PlatformLabel {
    if (automation.editor_version === 'canvas') {
        const triggerNode = getCanvasTriggerNode(automation)
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
            background: 'rgba(59,130,246,0.12)',
            color: '#60a5fa',
            border: '1px solid rgba(59,130,246,0.24)',
        }
    }
    if (platform === 'Instagram') {
        return {
            background: 'rgba(236,72,153,0.12)',
            color: '#f472b6',
            border: '1px solid rgba(236,72,153,0.24)',
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

function getCanvasTriggerSummary(automation: Automation): string {
    const triggerNode = getCanvasTriggerNode(automation)
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
    return automation.editor_version === 'canvas'
        ? getCanvasTriggerSummary(automation)
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

function getCanvasActionSummary(automation: Automation): string {
    const actionNodes = getCanvasActionNodes(automation)
    if (!actionNodes.length) return 'No actions configured'

    const labels = actionNodes
        .map((node) => ((node.data ?? {}) as WorkflowNodeData).label || 'Action')
        .filter(Boolean)

    const preview = labels.slice(0, 3)
    const suffix = labels.length > 3 ? ` +${labels.length - 3} more` : ''
    return `${preview.join(' • ')}${suffix}`
}

function getAutomationActionSummary(automation: Automation): string {
    return automation.editor_version === 'canvas'
        ? getCanvasActionSummary(automation)
        : getWizardActionSummary(automation)
}

function automationUsesSendDM(automation: Automation): boolean {
    if (automation.editor_version !== 'canvas') return true
    return getCanvasActionNodes(automation).some((node) => {
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
}: ActiveAutomationsListProps) {
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const togglingSet = new Set(togglingAutomationIds)

    const handleDeleteConfirm = () => {
        if (deleteConfirmId) {
            onDelete(deleteConfirmId)
            setDeleteConfirmId(null)
        }
    }

    return (
        <>
            <div className="space-y-3">
                {automations.map((automation) => (
                    (() => {
                        const isCanvas = automation.editor_version === 'canvas'
                        const platformLabel = getAutomationPlatformLabel(automation)
                        const platformChipStyles = getPlatformChipStyles(platformLabel)
                        const triggerSummary = getAutomationTriggerSummary(automation)
                        const actionSummary = getAutomationActionSummary(automation)
                        const hasDMAction = automationUsesSendDM(automation)
                        const canvasNodeCount = isCanvas ? (automation.workflow_graph?.nodes?.length || 0) : 0
                        const isToggling = togglingSet.has(automation.id)

                        return (
                            <div
                                key={automation.id}
                                className="overflow-hidden rounded-xl transition-all duration-200"
                                style={{
                                    background: '#0e0d1c',
                                    border: automation.is_active
                                        ? '1px solid rgba(52,211,153,0.2)'
                                        : '1px solid rgba(255,255,255,0.06)',
                                    boxShadow: automation.is_active
                                        ? '0 4px 20px rgba(52,211,153,0.06)'
                                        : 'none',
                                }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-stretch">
                            {/* Post Thumbnail */}
                            <div
                                className="relative w-full sm:w-24 h-28 sm:h-auto shrink-0 overflow-hidden"
                                style={{ background: '#12111e' }}
                            >
                                {automation.post_thumbnail_url ? (
                                    <img
                                        src={automation.post_thumbnail_url}
                                        alt={automation.name}
                                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <Zap className="h-7 w-7" style={{ color: 'rgba(255,255,255,0.12)' }} />
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
                                                style={
                                                    automation.is_active
                                                        ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                                                        : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }
                                                }
                                            >
                                                {automation.is_active ? 'Active' : 'Paused'}
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
                                                style={{ background: 'rgba(167,139,250,0.10)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.18)' }}
                                            >
                                                {isCanvas ? 'Canvas' : 'Wizard'}
                                            </span>
                                        </div>

                                        <div
                                            className="space-y-1 text-xs"
                                            style={{ color: 'rgba(255,255,255,0.42)' }}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#60a5fa' }} />
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
                                            style={{ color: 'rgba(255,255,255,0.35)' }}
                                        >
                                            <span className="flex items-center gap-1">
                                                <Activity className="h-3 w-3" style={{ color: '#34d399' }} />
                                                {automation.total_triggered} runs
                                            </span>

                                            {hasDMAction && (
                                                <span className="flex items-center gap-1">
                                                    <Send className="h-3 w-3" style={{ color: '#22c55e' }} />
                                                    {automation.total_dms_sent} DMs sent
                                                </span>
                                            )}

                                            {isCanvas && (
                                                <span className="flex items-center gap-1">
                                                    <Layers className="h-3 w-3" style={{ color: '#a78bfa' }} />
                                                    {canvasNodeCount} nodes
                                                </span>
                                            )}

                                            {!isCanvas && automation.trigger_config?.trigger_type === 'keywords' && (
                                                <span className="flex items-center gap-1">
                                                    <Hash className="h-3 w-3" style={{ color: '#60a5fa' }} />
                                                    {automation.trigger_config.keywords?.length || 0} keywords
                                                </span>
                                            )}
                                        </div>

                                        {automation.post_caption && (
                                            <p
                                                className="text-xs mt-1.5 truncate max-w-[200px] sm:max-w-md"
                                                style={{ color: 'rgba(255,255,255,0.25)' }}
                                            >
                                                {automation.post_caption}
                                            </p>
                                        )}
                                    </div>

                                {/* Actions */}
                                    <div className="flex items-center gap-3 self-end sm:self-center">
                                        {isToggling && (
                                            <div
                                                className="flex items-center gap-1.5 text-[10px] font-semibold"
                                                style={{ color: 'rgba(255,255,255,0.45)' }}
                                            >
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Updating…
                                            </div>
                                        )}
                                        <Switch
                                            checked={automation.is_active}
                                            disabled={isToggling}
                                            onCheckedChange={(checked) => onToggle(automation.id, checked)}
                                        />

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150"
                                                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)' }}
                                            >
                                                <DropdownMenuItem
                                                    onClick={() => onEdit(automation)}
                                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                                >
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.06)' }} />
                                                <DropdownMenuItem
                                                    onClick={() => setDeleteConfirmId(automation.id)}
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

            <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Automation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The automation will stop processing new events immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
