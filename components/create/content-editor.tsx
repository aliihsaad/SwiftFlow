"use client"

import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Smile, Sparkles } from "lucide-react"

interface ContentEditorProps {
    content: string
    onChange: (value: string) => void
    platforms: string[]
}

export function ContentEditor({ content, onChange, platforms }: ContentEditorProps) {
    const maxChars = platforms.includes("facebook") ? 63206 : 2200
    const isOverLimit = content.length > maxChars

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Caption</label>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50">
                    <Sparkles className="mr-1 h-3 w-3" />
                    AI Assistant
                </Button>
            </div>
            <div className="relative">
                <Textarea
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Write your amazing content here..."
                    className="min-h-[200px] resize-y pr-10"
                />
                <Button
                    size="icon"
                    variant="ghost"
                    className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => { }}
                >
                    <Smile className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex justify-end">
                <span className={`text-xs ${isOverLimit ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                    {content.length} / {maxChars}
                </span>
            </div>
        </div>
    )
}
