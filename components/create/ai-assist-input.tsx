"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

interface AIAssistInputProps {
    value: string
    onChange: (value: string) => void
    onGenerate: () => void
    isGenerating?: boolean
}

export function AIAssistInput({ value, onChange, onGenerate, isGenerating = false }: AIAssistInputProps) {
    return (
        <div className="flex gap-2 p-1 bg-muted/30 rounded-lg border border-dashed">
            <div className="relative flex-1">
                <Sparkles className="absolute left-3 top-2.5 h-4 w-4 text-purple-500" />
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Describe or drag & drop an image..."
                    className="pl-9 bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground"
                />
            </div>
            <Button
                size="sm"
                onClick={onGenerate}
                disabled={!value || isGenerating}
                className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
                {isGenerating ? 'Thinking...' : 'Suggestions'}
            </Button>
        </div>
    )
}
