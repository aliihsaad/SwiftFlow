"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, Loader2, Zap, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PostSelector } from "./post-selector"
import { TriggerConfigPanel } from "./trigger-config"
import { CommentReplyConfigPanel } from "./comment-reply-config"
import { DMConfigPanel } from "./dm-config"
import { DMPreview } from "./dm-preview"
import {
    Automation,
    CreateAutomationPayload,
    TriggerConfig,
    CommentReplyConfig,
    DMConfig,
    InstagramMedia
} from "@/types/automation"
import { useToast } from "@/components/ui/use-toast"

interface AutomationSetupModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    automation: Automation | null
    onSave: () => void
}

type Step = 'select-post' | 'configure-trigger' | 'configure-reply' | 'configure-dm' | 'review'

const STEPS: { id: Step; title: string }[] = [
    { id: 'select-post', title: 'Select Post' },
    { id: 'configure-trigger', title: 'Trigger' },
    { id: 'configure-reply', title: 'Comment Reply' },
    { id: 'configure-dm', title: 'DM Message' },
    { id: 'review', title: 'Review' },
]

export function AutomationSetupModal({
    open,
    onOpenChange,
    automation,
    onSave
}: AutomationSetupModalProps) {
    const { toast } = useToast()
    const [currentStep, setCurrentStep] = useState<Step>('select-post')
    const [isSaving, setIsSaving] = useState(false)

    // Form state
    const [name, setName] = useState('')
    const [selectedPost, setSelectedPost] = useState<InstagramMedia | null>(null)
    const [selectedAccountId, setSelectedAccountId] = useState<string>('')
    const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>({
        trigger_type: 'any_comment',
        keywords: []
    })
    const [commentReplyConfig, setCommentReplyConfig] = useState<CommentReplyConfig>({
        enabled: false,
        messages: ['Check your DMs!']
    })
    const [dmConfig, setDmConfig] = useState<DMConfig>({
        opening_message: "Thanks for your interest!",
        button_text: "Get the link",
        link_url: "",
        link_message: ""
    })

    // Reset form when modal opens/closes or automation changes
    useEffect(() => {
        if (open) {
            if (automation) {
                // Editing existing automation
                setName(automation.name)
                setSelectedPost({
                    id: automation.platform_post_id,
                    media_type: 'IMAGE',
                    thumbnail_url: automation.post_thumbnail_url,
                    caption: automation.post_caption,
                    timestamp: '',
                    permalink: ''
                })
                setSelectedAccountId(automation.social_account_id)
                setTriggerConfig(automation.trigger_config)
                setCommentReplyConfig(automation.comment_reply_config)
                setDmConfig(automation.dm_config)
                setCurrentStep('configure-trigger')
            } else {
                // Creating new automation
                setName('')
                setSelectedPost(null)
                setSelectedAccountId('')
                setTriggerConfig({ trigger_type: 'any_comment', keywords: [] })
                setCommentReplyConfig({ enabled: false, messages: ['Check your DMs!'] })
                setDmConfig({
                    opening_message: "Thanks for your interest!",
                    button_text: "Get the link",
                    link_url: "",
                    link_message: ""
                })
                setCurrentStep('select-post')
            }
        }
    }, [open, automation])

    const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)

    const canProceed = () => {
        switch (currentStep) {
            case 'select-post':
                return selectedPost !== null && selectedAccountId !== ''
            case 'configure-trigger':
                if (triggerConfig.trigger_type === 'keywords') {
                    return triggerConfig.keywords.length > 0
                }
                return true
            case 'configure-reply':
                if (commentReplyConfig.enabled) {
                    return commentReplyConfig.messages.length > 0 && commentReplyConfig.messages[0].trim() !== ''
                }
                return true
            case 'configure-dm':
                return dmConfig.opening_message.trim() !== '' &&
                    dmConfig.button_text.trim() !== '' &&
                    dmConfig.link_url.trim() !== ''
            case 'review':
                return name.trim() !== ''
            default:
                return true
        }
    }

    const goToNext = () => {
        const nextIndex = currentStepIndex + 1
        if (nextIndex < STEPS.length) {
            setCurrentStep(STEPS[nextIndex].id)
        }
    }

    const goToPrevious = () => {
        const prevIndex = currentStepIndex - 1
        if (prevIndex >= 0) {
            setCurrentStep(STEPS[prevIndex].id)
        }
    }

    const handleSave = async () => {
        if (!selectedPost || !selectedAccountId) return

        setIsSaving(true)
        try {
            const payload: CreateAutomationPayload = {
                social_account_id: selectedAccountId,
                name: name.trim(),
                platform_post_id: selectedPost.id,
                post_thumbnail_url: selectedPost.thumbnail_url || selectedPost.media_url,
                post_caption: selectedPost.caption,
                trigger_config: triggerConfig,
                comment_reply_config: commentReplyConfig,
                dm_config: dmConfig
            }

            const url = automation
                ? `/api/automations/${automation.id}`
                : '/api/automations'
            const method = automation ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to save automation')
            }

            toast({
                title: automation ? "Automation updated" : "Automation created",
                description: automation
                    ? "Your automation has been updated successfully."
                    : "Your automation is now active and will process new comments.",
            })

            onSave()
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to save automation",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 max-h-dvh sm:max-h-[90vh] h-full sm:h-auto flex flex-col">
                <DialogTitle className="sr-only">
                    {automation ? 'Edit Automation' : 'Create Auto-DM Automation'}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    Set up an automation to automatically send DMs to users who comment on your posts.
                </DialogDescription>

                {/* Header with Steps */}
                <div className="border-b px-4 sm:px-6 py-3 sm:py-4 shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        <h2 className="font-semibold text-sm sm:text-base">
                            {automation ? 'Edit Automation' : 'Create Auto-DM Automation'}
                        </h2>
                    </div>

                    {/* Step Indicators */}
                    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
                        {STEPS.map((step, index) => (
                            <div key={step.id} className="flex items-center shrink-0">
                                <button
                                    onClick={() => {
                                        if (index <= currentStepIndex) {
                                            setCurrentStep(step.id)
                                        }
                                    }}
                                    disabled={index > currentStepIndex}
                                    className={cn(
                                        "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm transition-colors whitespace-nowrap",
                                        currentStep === step.id
                                            ? "bg-primary text-primary-foreground"
                                            : index < currentStepIndex
                                                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                                : "bg-muted text-muted-foreground",
                                        index <= currentStepIndex && "cursor-pointer hover:opacity-80"
                                    )}
                                >
                                    {index < currentStepIndex ? (
                                        <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    ) : (
                                        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-xs">
                                            {index + 1}
                                        </span>
                                    )}
                                    <span className="hidden sm:inline">{step.title}</span>
                                </button>
                                {index < STEPS.length - 1 && (
                                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground mx-0.5 sm:mx-1" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {currentStep === 'select-post' && (
                        <PostSelector
                            selectedPost={selectedPost}
                            selectedAccountId={selectedAccountId}
                            onSelect={(post, accountId) => {
                                setSelectedPost(post)
                                setSelectedAccountId(accountId)
                            }}
                        />
                    )}

                    {currentStep === 'configure-trigger' && (
                        <TriggerConfigPanel
                            config={triggerConfig}
                            onChange={setTriggerConfig}
                        />
                    )}

                    {currentStep === 'configure-reply' && (
                        <CommentReplyConfigPanel
                            config={commentReplyConfig}
                            onChange={setCommentReplyConfig}
                        />
                    )}

                    {currentStep === 'configure-dm' && (
                        <div className="grid lg:grid-cols-2 gap-6">
                            <DMConfigPanel
                                config={dmConfig}
                                onChange={setDmConfig}
                            />
                            <DMPreview config={dmConfig} />
                        </div>
                    )}

                    {currentStep === 'review' && (
                        <div className="space-y-6">
                            <div>
                                <Label htmlFor="automation-name" className="text-base font-medium">
                                    Automation Name
                                </Label>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Give your automation a memorable name
                                </p>
                                <Input
                                    id="automation-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Free Guide DM"
                                    className="w-full sm:max-w-md"
                                />
                            </div>

                            <div className="border rounded-lg p-3 sm:p-4 space-y-4">
                                <h3 className="font-medium">Summary</h3>

                                <div className="grid gap-3 text-sm">
                                    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                                        <span className="text-muted-foreground">Post</span>
                                        <span className="font-medium truncate sm:max-w-xs sm:text-right">
                                            {selectedPost?.caption?.substring(0, 50) || 'Selected post'}
                                            {selectedPost?.caption && selectedPost.caption.length > 50 && '...'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                                        <span className="text-muted-foreground">Trigger</span>
                                        <span className="font-medium sm:text-right">
                                            {triggerConfig.trigger_type === 'any_comment'
                                                ? 'Any comment'
                                                : `Keywords: ${triggerConfig.keywords.join(', ')}`}
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                                        <span className="text-muted-foreground">Comment Reply</span>
                                        <span className="font-medium">
                                            {commentReplyConfig.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b gap-1">
                                        <span className="text-muted-foreground">DM Link</span>
                                        <span className="font-medium truncate sm:max-w-xs sm:text-right">
                                            {dmConfig.link_url}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <DMPreview config={dmConfig} />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-3 sm:p-4 flex items-center justify-between shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={currentStepIndex === 0 ? () => onOpenChange(false) : goToPrevious}
                        className="sm:size-default"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1 sm:mr-2" />
                        {currentStepIndex === 0 ? 'Cancel' : 'Back'}
                    </Button>

                    {currentStep === 'review' ? (
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!canProceed() || isSaving}
                            className="bg-linear-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white sm:size-default"
                        >
                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {automation ? 'Save Changes' : 'Create Automation'}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            onClick={goToNext}
                            disabled={!canProceed()}
                            className="sm:size-default"
                        >
                            Continue
                            <ChevronRight className="h-4 w-4 ml-1 sm:ml-2" />
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
