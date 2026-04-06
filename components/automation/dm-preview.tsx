"use client"

import { DMConfig } from "@/types/automation"
import { Card } from "@/components/ui/card"
import { Instagram, ExternalLink } from "lucide-react"

interface DMPreviewProps {
    config: DMConfig
}

export function DMPreview({ config }: DMPreviewProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Instagram className="h-4 w-4" />
                <span>DM Preview</span>
            </div>

            <Card className="bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                {/* Instagram-style chat header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        Y
                    </div>
                    <div>
                        <p className="text-sm font-medium">Your Business</p>
                        <p className="text-xs text-muted-foreground">Instagram</p>
                    </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-3 min-h-[200px]">
                    {/* Opening message */}
                    <div className="flex justify-end">
                        <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2">
                            <p className="text-sm whitespace-pre-wrap">
                                {config.opening_message || 'Your opening message will appear here...'}
                            </p>
                        </div>
                    </div>

                    {/* Link button card */}
                    {(config.button_text || config.link_url) && (
                        <div className="flex justify-end">
                            <div className="max-w-[80%]">
                                <div className="bg-white dark:bg-zinc-700 rounded-xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-600">
                                    {/* Link preview header */}
                                    <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-600/50 border-b border-zinc-200 dark:border-zinc-600">
                                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                            <ExternalLink className="h-3 w-3" />
                                            {config.link_url ? (() => {
                                                try {
                                                    return new URL(config.link_url).hostname;
                                                } catch {
                                                    return 'example.com';
                                                }
                                            })() : 'example.com'}
                                        </p>
                                    </div>
                                    {/* Button */}
                                    <button className="w-full px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-600/50 transition-colors">
                                        {config.button_text || 'Get the link'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Follow-up message */}
                    {config.link_message && (
                        <div className="flex justify-end">
                            <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2">
                                <p className="text-sm">
                                    {config.link_message}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input area (decorative) */}
                <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white dark:bg-zinc-700 rounded-full px-4 py-2 text-sm text-muted-foreground">
                            Message...
                        </div>
                    </div>
                </div>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
                This is a preview of how your DM will appear to users
            </p>
        </div>
    )
}
