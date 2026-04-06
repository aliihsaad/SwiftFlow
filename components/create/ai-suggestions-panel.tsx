"use client"

import { Button } from "@/components/ui/button"
import { Sparkles, X } from "lucide-react"

interface AISuggestionsPanelProps {
    suggestions: string[]
    onSelect: (suggestion: string) => void
    onClose: () => void
    isLoading: boolean
}

export function AISuggestionsPanel({ suggestions, onSelect, onClose, isLoading }: AISuggestionsPanelProps) {
    if (!isLoading && suggestions.length === 0) return null

    return (
        <div className="bg-muted/30 border rounded-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <h4 className="text-sm font-medium">AI Suggestions</h4>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="h-3 w-3" />
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    <div className="h-16 bg-muted animate-pulse rounded-md" />
                    <div className="h-16 bg-muted animate-pulse rounded-md" />
                    <div className="h-16 bg-muted animate-pulse rounded-md" />
                </div>
            ) : (
                <div className="grid gap-2">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={index}
                            onClick={() => onSelect(suggestion)}
                            className="text-left text-sm p-3 rounded-md bg-background border hover:border-purple-500 hover:shadow-sm transition-all"
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
