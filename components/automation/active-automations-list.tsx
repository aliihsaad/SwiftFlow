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
    History,
} from "lucide-react"

interface ActiveAutomationsListProps {
    automations: Automation[]
    onEdit: (automation: Automation) => void
    onToggle: (automationId: string, isActive: boolean) => void
    onDelete: (automationId: string) => Promise<void> | void
    onViewRuns: (automation: Automation) => void
    togglingAutomationIds?: string[]
    deletingAutomationIds?: string[]
    readOnly?: boolean
}

type PlatformLabel = 'Instagram'

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

function getAutomationPlatformLabel(_automation: Automation): PlatformLabel {
    return 'Instagram'
}

function getPlatformChipClass(_platform: PlatformLabel): string {
    return 'border-pink-300/15 bg-pink-300/[0.07] text-pink-100'
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
    onViewRuns,
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
            <div className="grid gap-4 xl:grid-cols-2">
                {automations.map((automation) => {
                    const isCanvas = automation.editor_version === 'canvas'
                    const isGraphWizard = isGraphBackedWizard(automation)
                    const isGraph = isGraphAutomation(automation)
                    const platformLabel = getAutomationPlatformLabel(automation)
                    const triggerSummary = getAutomationTriggerSummary(automation)
                    const actionSummary = getAutomationActionSummary(automation)
                    const hasDMAction = automationUsesSendDM(automation)
                    const graphNodeCount = isGraph ? (automation.workflow_graph?.nodes?.length || 0) : 0
                    const graphActionCount = isGraph ? getGraphActionNodes(automation).length : 0
                    const isToggling = togglingSet.has(automation.id)
                    const isDeleting = deletingSet.has(automation.id)
                    const isDraftWizard = isGraphWizard && !automation.is_active
                    const statusLabel = isDraftWizard ? 'Draft' : automation.is_active ? 'Live' : 'Paused'
                    const editorBadge = isCanvas ? 'Visual canvas' : isGraphWizard ? 'Guided graph' : 'Guided setup'
                    const statusClass = automation.is_active
                        ? 'border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-200'
                        : isDraftWizard
                            ? 'border-amber-300/15 bg-amber-300/[0.08] text-amber-200'
                            : 'border-white/10 bg-white/[0.045] text-white/40'

                    return (
                        <article
                            key={automation.id}
                            className="group relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.025] transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.035]"
                        >
                            <div
                                className={'absolute inset-x-0 top-0 h-px ' + (
                                    automation.is_active
                                        ? 'bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent'
                                        : 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
                                )}
                            />

                            <div className="p-4 sm:p-5">
                                <div className="flex items-start gap-4">
                                    <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#171923]">
                                        {automation.post_thumbnail_url ? (
                                            <Image
                                                src={automation.post_thumbnail_url}
                                                alt=""
                                                fill
                                                unoptimized
                                                sizes="56px"
                                                className="object-cover opacity-85 transition duration-300 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="grid h-full place-items-center bg-gradient-to-br from-cyan-300/[0.10] to-violet-400/[0.10]">
                                                <Layers className="size-5 text-cyan-100/60" aria-hidden="true" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-[15px] font-semibold text-white/90">
                                                    {automation.name}
                                                </h3>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    <span className={'rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ' + statusClass}>
                                                        {statusLabel}
                                                    </span>
                                                    <span className={'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ' + getPlatformChipClass(platformLabel)}>
                                                        {platformLabel}
                                                    </span>
                                                    <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100/70">
                                                        {editorBadge}
                                                    </span>
                                                </div>
                                            </div>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button
                                                        type="button"
                                                        disabled={isDeleting}
                                                        aria-label={'More options for ' + automation.name}
                                                        className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-white/35 transition hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-40"
                                                    >
                                                        <MoreVertical className="size-4" aria-hidden="true" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="border-white/10 bg-[#191b26] text-white/75">
                                                    <DropdownMenuItem onClick={() => onViewRuns(automation)}>
                                                        <History className="mr-2 size-4" />
                                                        Execution history
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-white/[0.07]" />
                                                    <DropdownMenuItem
                                                        disabled={readOnly || isDeleting}
                                                        onClick={() => {
                                                            if (!readOnly) onEdit(automation)
                                                        }}
                                                    >
                                                        <Edit2 className="mr-2 size-4" />
                                                        Edit workflow
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-white/[0.07]" />
                                                    <DropdownMenuItem
                                                        disabled={readOnly || isDeleting}
                                                        onClick={() => {
                                                            if (!readOnly) setDeleteConfirmId(automation.id)
                                                        }}
                                                        className="text-rose-300 focus:text-rose-200"
                                                    >
                                                        <Trash2 className="mr-2 size-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/45">
                                            <MessageCircle className="size-3.5" aria-hidden="true" />
                                            When
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/65">{triggerSummary}</p>
                                    </div>
                                    <div className="rounded-xl border border-violet-300/10 bg-violet-300/[0.035] p-3">
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/45">
                                            <Zap className="size-3.5" aria-hidden="true" />
                                            Then
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/65">{actionSummary}</p>
                                    </div>
                                </div>

                                {automation.post_caption && (
                                    <p className="mt-3 truncate text-[11px] text-white/25">{automation.post_caption}</p>
                                )}

                                <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.065] pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/38">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Activity className="size-3 text-emerald-300" aria-hidden="true" />
                                            {automation.total_triggered} runs
                                        </span>
                                        {hasDMAction && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Send className="size-3 text-pink-300" aria-hidden="true" />
                                                {automation.total_dms_sent} DMs
                                            </span>
                                        )}
                                        {isGraph && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Layers className="size-3 text-violet-300" aria-hidden="true" />
                                                {graphActionCount} actions
                                            </span>
                                        )}
                                        {isCanvas && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Zap className="size-3 text-amber-300" aria-hidden="true" />
                                                {graphNodeCount} nodes
                                            </span>
                                        )}
                                        {!isGraph && automation.trigger_config?.trigger_type === 'keywords' && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Hash className="size-3 text-cyan-300" aria-hidden="true" />
                                                {automation.trigger_config.keywords?.length || 0} keywords
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                                        {(isToggling || isDeleting) && (
                                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/40">
                                                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                                                {isDeleting ? 'Deleting…' : 'Updating…'}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onViewRuns(automation)}
                                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.065] hover:text-white/80"
                                        >
                                            <History className="size-3.5" aria-hidden="true" />
                                            Activity
                                        </button>
                                        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                                                {automation.is_active ? 'On' : 'Off'}
                                            </span>
                                            <Switch
                                                aria-label={(automation.is_active ? 'Pause ' : 'Activate ') + automation.name}
                                                checked={automation.is_active}
                                                disabled={readOnly || isToggling || isDeleting}
                                                onCheckedChange={(checked) => {
                                                    if (!readOnly) onToggle(automation.id, checked)
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    )
                })}
            </div>

            <AlertDialog                open={!!deleteConfirmId}
                onOpenChange={(open) => {
                    if (isDeleteSubmitting) return
                    if (!open) setDeleteConfirmId(null)
                }}
            >
                <AlertDialogContent className="border-white/10 bg-[#171923]">
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
