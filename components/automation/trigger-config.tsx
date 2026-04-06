"use client"

import { useState } from "react"
import { TriggerConfig } from "@/types/automation"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { MessageCircle, Hash, X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface TriggerConfigPanelProps {
    config: TriggerConfig
    onChange: (config: TriggerConfig) => void
}

export function TriggerConfigPanel({ config, onChange }: TriggerConfigPanelProps) {
    const [newKeyword, setNewKeyword] = useState('')

    const handleTypeChange = (value: string) => {
        onChange({
            ...config,
            trigger_type: value as 'any_comment' | 'keywords'
        })
    }

    const addKeyword = () => {
        const keyword = newKeyword.trim().toLowerCase()
        if (keyword && !config.keywords.includes(keyword)) {
            onChange({
                ...config,
                keywords: [...config.keywords, keyword]
            })
            setNewKeyword('')
        }
    }

    const removeKeyword = (keyword: string) => {
        onChange({
            ...config,
            keywords: config.keywords.filter(k => k !== keyword)
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addKeyword()
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-2">Configure Trigger</h3>
                <p className="text-sm text-muted-foreground">
                    Choose when this automation should be triggered.
                </p>
            </div>

            <RadioGroup
                value={config.trigger_type}
                onValueChange={handleTypeChange}
                className="space-y-4"
            >
                {/* Any Comment Option */}
                <label
                    className={cn(
                        "flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors",
                        config.trigger_type === 'any_comment'
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                    )}
                >
                    <RadioGroupItem value="any_comment" className="mt-0.5" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-primary" />
                            <span className="font-medium">Any Comment</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Trigger the automation for every comment on this post. Best for posts where you want to engage with everyone.
                        </p>
                    </div>
                </label>

                {/* Keywords Option */}
                <label
                    className={cn(
                        "flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors",
                        config.trigger_type === 'keywords'
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                    )}
                >
                    <RadioGroupItem value="keywords" className="mt-0.5" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-primary" />
                            <span className="font-medium">Specific Keywords</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Only trigger when a comment contains specific keywords. Perfect for "comment LINK to get the guide" style posts.
                        </p>
                    </div>
                </label>
            </RadioGroup>

            {/* Keywords Input */}
            {config.trigger_type === 'keywords' && (
                <div className="space-y-4 pl-8 border-l-2 border-primary/20 ml-2">
                    <div className="space-y-2">
                        <Label>Keywords to Match</Label>
                        <p className="text-xs text-muted-foreground">
                            Add keywords that will trigger the DM. Case-insensitive matching.
                        </p>
                        <div className="flex gap-2">
                            <Input
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter a keyword..."
                                className="flex-1"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={addKeyword}
                                disabled={!newKeyword.trim()}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                            </Button>
                        </div>
                    </div>

                    {/* Keywords List */}
                    {config.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {config.keywords.map((keyword) => (
                                <Badge
                                    key={keyword}
                                    variant="secondary"
                                    className="px-3 py-1 text-sm"
                                >
                                    {keyword}
                                    <button
                                        onClick={() => removeKeyword(keyword)}
                                        className="ml-2 hover:text-destructive"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    {config.keywords.length === 0 && (
                        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                            Add at least one keyword to continue.
                        </div>
                    )}

                    {/* Suggested Keywords */}
                    <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Suggestions:</span>{' '}
                        <button
                            type="button"
                            onClick={() => onChange({ ...config, keywords: [...config.keywords, 'link'] })}
                            className="text-primary hover:underline"
                            disabled={config.keywords.includes('link')}
                        >
                            link
                        </button>
                        ,{' '}
                        <button
                            type="button"
                            onClick={() => onChange({ ...config, keywords: [...config.keywords, 'guide'] })}
                            className="text-primary hover:underline"
                            disabled={config.keywords.includes('guide')}
                        >
                            guide
                        </button>
                        ,{' '}
                        <button
                            type="button"
                            onClick={() => onChange({ ...config, keywords: [...config.keywords, 'yes'] })}
                            className="text-primary hover:underline"
                            disabled={config.keywords.includes('yes')}
                        >
                            yes
                        </button>
                        ,{' '}
                        <button
                            type="button"
                            onClick={() => onChange({ ...config, keywords: [...config.keywords, 'interested'] })}
                            className="text-primary hover:underline"
                            disabled={config.keywords.includes('interested')}
                        >
                            interested
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
