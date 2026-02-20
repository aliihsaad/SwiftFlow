"use client"

import { useState } from "react"
import { Automation } from "@/types/automation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"

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
            <div className="space-y-4">
                {automations.map((automation) => (
                    <Card key={automation.id} className="overflow-hidden">
                        <CardContent className="p-0">
                            <div className="flex flex-col sm:flex-row sm:items-stretch">
                                {/* Post Thumbnail */}
                                <div className="relative w-full sm:w-24 h-32 sm:h-24 shrink-0 bg-muted">
                                    {automation.post_thumbnail_url ? (
                                        <img
                                            src={automation.post_thumbnail_url}
                                            alt={automation.name}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-full">
                                            <Zap className="h-8 w-8 text-muted-foreground/50" />
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-medium truncate text-sm sm:text-base">{automation.name}</h3>
                                            <Badge
                                                variant={automation.is_active ? "default" : "secondary"}
                                                className={cn(
                                                    "text-xs shrink-0",
                                                    automation.is_active && "bg-green-500 hover:bg-green-600"
                                                )}
                                            >
                                                {automation.is_active ? "Active" : "Paused"}
                                            </Badge>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                            {/* Editor type badge */}
                                            {automation.editor_version === 'canvas' ? (
                                                <span className="flex items-center gap-1">
                                                    <Workflow className="h-3.5 w-3.5" />
                                                    {automation.workflow_graph?.nodes?.length || 0} nodes
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1">
                                                    {automation.trigger_config?.trigger_type === 'keywords' ? (
                                                        <>
                                                            <Hash className="h-3.5 w-3.5" />
                                                            {automation.trigger_config.keywords?.length || 0} keywords
                                                        </>
                                                    ) : (
                                                        <>
                                                            <MessageCircle className="h-3.5 w-3.5" />
                                                            Any comment
                                                        </>
                                                    )}
                                                </span>
                                            )}

                                            {/* Stats */}
                                            <span className="flex items-center gap-1">
                                                <Send className="h-3.5 w-3.5" />
                                                {automation.total_dms_sent} DMs sent
                                            </span>
                                        </div>

                                        {automation.post_caption && (
                                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px] sm:max-w-md">
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
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(automation)}>
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => setDeleteConfirmId(automation.id)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Delete Confirmation Dialog */}
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
