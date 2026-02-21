"use client"

import { useState } from "react"
import { Automation } from "@/types/automation"
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
} from "lucide-react"

interface ActiveAutomationsListProps {
    automations: Automation[]
    onEdit: (automation: Automation) => void
    onToggle: (automationId: string, isActive: boolean) => void
    onDelete: (automationId: string) => void
}

export function ActiveAutomationsList({
    automations,
    onEdit,
    onToggle,
    onDelete
}: ActiveAutomationsListProps) {
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

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
                                    <div className="flex items-center gap-2.5 mb-1.5">
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

                                    <div
                                        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                                        style={{ color: 'rgba(255,255,255,0.35)' }}
                                    >
                                        {automation.editor_version === 'canvas' ? (
                                            <span className="flex items-center gap-1">
                                                <Workflow className="h-3 w-3" style={{ color: '#a78bfa' }} />
                                                {automation.workflow_graph?.nodes?.length || 0} nodes
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1">
                                                {automation.trigger_config?.trigger_type === 'keywords' ? (
                                                    <>
                                                        <Hash className="h-3 w-3" style={{ color: '#60a5fa' }} />
                                                        {automation.trigger_config.keywords?.length || 0} keywords
                                                    </>
                                                ) : (
                                                    <>
                                                        <MessageCircle className="h-3 w-3" style={{ color: '#60a5fa' }} />
                                                        Any comment
                                                    </>
                                                )}
                                            </span>
                                        )}

                                        <span className="flex items-center gap-1">
                                            <Send className="h-3 w-3" style={{ color: '#34d399' }} />
                                            {automation.total_dms_sent} DMs sent
                                        </span>
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
                                    <Switch
                                        checked={automation.is_active}
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
                ))}
            </div>

            <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Automation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The automation will stop processing new comments immediately.
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
