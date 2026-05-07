"use client"

import { CommentReplyConfig } from "@/types/automation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { MessageCircle, Info, Sparkles } from "lucide-react"

interface CommentReplyConfigPanelProps {
    config: CommentReplyConfig
    onChange: (config: CommentReplyConfig) => void
}

export function CommentReplyConfigPanel({ config, onChange }: CommentReplyConfigPanelProps) {
    const handleToggle = (enabled: boolean) => {
        onChange({ ...config, enabled })
    }

    const handleMessageChange = (message: string) => {
        onChange({ ...config, messages: [message] })
    }

    const handleAiToggle = (use_ai_response: boolean) => {
        onChange({ ...config, use_ai_response })
    }

    const useAi = config.use_ai_response === true

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-2">Comment Reply (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                    Optionally reply to the comment to let users know to check their DMs.
                </p>
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <MessageCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <Label className="text-base font-medium">Auto-reply to comment</Label>
                        <p className="text-sm text-muted-foreground">
                            Post a reply directing users to check their DMs
                        </p>
                    </div>
                </div>
                <Switch
                    checked={config.enabled}
                    onCheckedChange={handleToggle}
                />
            </div>

            {/* Reply Message */}
            {config.enabled && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                    {/* AI toggle */}
                    <div className="flex items-center justify-between rounded-lg border border-violet-300/40 bg-violet-50 dark:bg-violet-950/20 p-3">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-violet-100 dark:bg-violet-900/40">
                                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                            </div>
                            <div>
                                <Label className="text-sm font-medium">Use AI response</Label>
                                <p className="text-xs text-muted-foreground">
                                    Generate the reply automatically based on the comment.
                                </p>
                            </div>
                        </div>
                        <Switch checked={useAi} onCheckedChange={handleAiToggle} />
                    </div>

                    {!useAi && (
                        <>
                    <div className="space-y-2">
                        <Label>Reply Message</Label>
                        <Input
                            value={config.messages[0] || ''}
                            onChange={(e) => handleMessageChange(e.target.value)}
                            placeholder="Check your DMs!"
                            maxLength={150}
                        />
                        <p className="text-xs text-muted-foreground">
                            {(config.messages[0] || '').length}/150 characters
                        </p>
                    </div>

                    {/* Suggestions */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Quick Templates</Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                "Check your DMs! 💬",
                                "Sent! Check your inbox 📩",
                                "Just sent it to you! 🎉",
                                "Done! Look in your messages ✨"
                            ].map((template) => (
                                <button
                                    key={template}
                                    type="button"
                                    onClick={() => handleMessageChange(template)}
                                    className="text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full transition-colors"
                                >
                                    {template}
                                </button>
                            ))}
                        </div>
                    </div>
                        </>
                    )}

                    {/* Info */}
                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>
                            The reply will be posted publicly on Instagram as a response to the user's comment.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
