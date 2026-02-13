"use client"

import { DMConfig } from "@/types/automation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Send, Link as LinkIcon, MessageSquare, MousePointer } from "lucide-react"

interface DMConfigPanelProps {
    config: DMConfig
    onChange: (config: DMConfig) => void
}

export function DMConfigPanel({ config, onChange }: DMConfigPanelProps) {
    const updateField = <K extends keyof DMConfig>(field: K, value: DMConfig[K]) => {
        onChange({ ...config, [field]: value })
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-2">DM Message</h3>
                <p className="text-sm text-muted-foreground">
                    Configure the direct message that will be sent to users.
                </p>
            </div>

            {/* Opening Message */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Opening Message
                </Label>
                <Textarea
                    value={config.opening_message}
                    onChange={(e) => updateField('opening_message', e.target.value)}
                    placeholder="Thanks for your interest! Click the button below to get your exclusive link."
                    rows={3}
                    maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                    {config.opening_message.length}/500 characters. This message appears above the link button.
                </p>
            </div>

            {/* Button Text */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4 text-muted-foreground" />
                    Button Text
                </Label>
                <Input
                    value={config.button_text}
                    onChange={(e) => updateField('button_text', e.target.value)}
                    placeholder="Get the link"
                    maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                    {config.button_text.length}/20 characters. Keep it short and actionable.
                </p>
            </div>

            {/* Link URL */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    Link URL
                </Label>
                <Input
                    type="url"
                    value={config.link_url}
                    onChange={(e) => updateField('link_url', e.target.value)}
                    placeholder="https://example.com/your-link"
                />
                <p className="text-xs text-muted-foreground">
                    The URL that opens when users click the button.
                </p>
            </div>

            {/* Link Message (Optional) */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    Follow-up Message
                    <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                    value={config.link_message || ''}
                    onChange={(e) => updateField('link_message', e.target.value)}
                    placeholder="Let me know if you have any questions!"
                    maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                    Optional message sent after the link button.
                </p>
            </div>

            {/* Validation */}
            {(!config.opening_message.trim() || !config.button_text.trim() || !config.link_url.trim()) && (
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                    Please fill in the opening message, button text, and link URL to continue.
                </div>
            )}
        </div>
    )
}
