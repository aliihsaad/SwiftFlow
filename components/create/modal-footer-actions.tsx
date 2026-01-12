"use client"

import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"

interface ModalFooterActionsProps {
    onSuggestions: () => void
    onCancel: () => void
    onDraft: () => void
    onSchedule: () => void
    onPostNow: () => void
    isSubmitting: boolean
    isGenerating: boolean
    isValid: boolean
    hasScheduledTime: boolean
}

export function ModalFooterActions({
    onSuggestions,
    onCancel,
    onDraft,
    onSchedule,
    onPostNow,
    isSubmitting,
    isGenerating,
    isValid,
    hasScheduledTime
}: ModalFooterActionsProps) {
    return (
        <div className="flex items-center justify-between p-6 border-t bg-muted/10">
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onSuggestions}
                    disabled={isGenerating}
                    className="gap-2"
                >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-500" />}
                    Suggestions
                </Button>
            </div>

            <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button variant="outline" onClick={onDraft} disabled={!isValid || isSubmitting}>
                    Save as Draft
                </Button>

                {hasScheduledTime ? (
                    <Button
                        onClick={onSchedule}
                        disabled={!isValid || isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Schedule Post
                    </Button>
                ) : (
                    <Button
                        onClick={onPostNow}
                        disabled={!isValid || isSubmitting}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Post Now
                    </Button>
                )}
            </div>
        </div>
    )
}
