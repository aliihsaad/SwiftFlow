"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Eye, EyeOff, Save, CheckCircle2, XCircle } from "lucide-react"
import { WorkspaceSettings } from "@/types/settings"
import { removeCurrentWorkspaceProviderKey, updateCurrentWorkspaceSettings } from "@/app/actions/settings"
import { toast } from "sonner"
import {
    getCuratedModelsForProvider,
    getDefaultTextModelForProvider,
    getFallbackModelsForProvider,
    getModelRecommendationLabel,
    isAIProvider,
    type AIModelOption,
    type AIProvider,
} from "@/lib/ai-models"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"

interface ApiSettingsFormProps {
    settings: WorkspaceSettings | null
}

export function ApiSettingsForm({ settings }: ApiSettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [removingProvider, setRemovingProvider] = useState<AIProvider | null>(null)
    const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
    const [showGeminiKey, setShowGeminiKey] = useState(false)
    const [showOpenAIKey, setShowOpenAIKey] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null)
    const [savedKeys, setSavedKeys] = useState({
        openrouter: settings?.has_openrouter_api_key ?? false,
        gemini: settings?.has_gemini_api_key ?? false,
        openai: settings?.has_openai_api_key ?? false,
    })
    const canEditSettings = useWorkspacePermission("settings:write")

    const initialProvider: AIProvider = isAIProvider(settings?.ai_provider || '')
        ? (settings!.ai_provider as AIProvider)
        : 'openrouter'

    const [formData, setFormData] = useState({
        ai_provider: initialProvider,
        openrouter_api_key: '',
        gemini_api_key: '',
        openai_api_key: '',
        ai_text_model_name: settings?.ai_text_model_name || settings?.ai_model_name || getDefaultTextModelForProvider(initialProvider),
        ai_temperature: settings?.ai_temperature || 0.7,
        ai_max_tokens: settings?.ai_max_tokens || 2048,

    })

    const fetcher = async (url: string) => {
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to fetch models')
        return data as { models?: string[]; curated?: AIModelOption[]; source?: 'live' | 'fallback' | 'curated'; reason?: string }
    }

    const { data: textModelsData, isLoading: isTextModelsLoading } = useSWR(
        `/api/ai/models?provider=${formData.ai_provider}&capability=text`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    const textModelOptions =
        Array.isArray(textModelsData?.models) && textModelsData.models.length > 0
            ? textModelsData.models
            : getFallbackModelsForProvider(formData.ai_provider, 'text')

    const curatedTextModels =
        Array.isArray(textModelsData?.curated) && textModelsData.curated.length > 0
            ? textModelsData.curated
            : getCuratedModelsForProvider(formData.ai_provider, 'text')

    const resolvedTextModelName = textModelOptions.includes(formData.ai_text_model_name) ? formData.ai_text_model_name : (textModelOptions[0] || '')

    const handleTestKey = async () => {
        const key =
            formData.ai_provider === 'openrouter'
                ? formData.openrouter_api_key
                : formData.ai_provider === 'openai'
                    ? formData.openai_api_key
                    : formData.gemini_api_key
        if (!key.trim() && !savedKeys[formData.ai_provider]) {
            setTestResult({ valid: false, error: 'Enter an API key first.' })
            return
        }
        setIsTesting(true)
        setTestResult(null)
        try {
            const res = await fetch('/api/ai/validate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: formData.ai_provider,
                    ...(key.trim() ? { apiKey: key } : {}),
                }),
            })
            const data = await res.json()
            setTestResult(data)
        } catch {
            setTestResult({ valid: false, error: 'Network error. Could not reach validation endpoint.' })
        } finally {
            setIsTesting(false)
        }
    }

    const handleProviderChange = (value: string) => {
        const provider: AIProvider = isAIProvider(value) ? value : 'openrouter'
        setTestResult(null)
        setFormData((prev) => ({
            ...prev,
            ai_provider: provider,
            ai_text_model_name: getDefaultTextModelForProvider(provider),
        }))
    }

    const handleRemoveSavedKey = async () => {
        if (!removingProvider || !canEditSettings) return

        setIsLoading(true)
        try {
            await removeCurrentWorkspaceProviderKey(removingProvider)
            setSavedKeys((prev) => ({
                ...prev,
                [removingProvider]: false,
            }))
            setFormData((prev) => ({
                ...prev,
                ...(removingProvider === 'openrouter' ? { openrouter_api_key: '' } : {}),
                ...(removingProvider === 'gemini' ? { gemini_api_key: '' } : {}),
                ...(removingProvider === 'openai' ? { openai_api_key: '' } : {}),
            }))
            setTestResult(null)
            toast.success(`${removingProvider === 'openai' ? 'OpenAI' : removingProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'} key removed`)
            setRemovingProvider(null)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to remove API key"
            toast.error(message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canEditSettings) return
        setIsLoading(true)

        try {
            const payload: Parameters<typeof updateCurrentWorkspaceSettings>[0] = {
                ai_provider: formData.ai_provider,
                ai_text_model_name: resolvedTextModelName,
                ai_temperature: formData.ai_temperature,
                ai_max_tokens: formData.ai_max_tokens,
            }

            if (formData.openrouter_api_key.trim()) {
                payload.openrouter_api_key = formData.openrouter_api_key
            }
            if (formData.gemini_api_key.trim()) {
                payload.gemini_api_key = formData.gemini_api_key
            }
            if (formData.openai_api_key.trim()) {
                payload.openai_api_key = formData.openai_api_key
            }

            await updateCurrentWorkspaceSettings(payload)
            setSavedKeys((prev) => ({
                openrouter: prev.openrouter || formData.openrouter_api_key.trim().length > 0,
                gemini: prev.gemini || formData.gemini_api_key.trim().length > 0,
                openai: prev.openai || formData.openai_api_key.trim().length > 0,
            }))
            setFormData((prev) => ({
                ...prev,
                openrouter_api_key: '',
                gemini_api_key: '',
                openai_api_key: '',
            }))
            toast.success("Settings updated successfully!")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update settings"
            toast.error(message)
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const panelClass = "rounded-[22px] border-white/9 bg-white/[0.025] text-white/85 shadow-none"
    const fieldClass = "border-white/10 bg-black/20 text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const selectTriggerClass = "border-white/10 bg-black/20 text-white/85 focus:ring-cyan-400/30"
    const selectContentClass = "border-white/10 bg-[#1b1d28] text-white/85"
    const helperClass = "text-xs text-white/45"
    const showAdvancedSamplingControls = formData.ai_provider !== 'openrouter'
    const hasSavedOpenRouterKey = savedKeys.openrouter
    const hasSavedGeminiKey = savedKeys.gemini
    const hasSavedOpenAIKey = savedKeys.openai
    const activeDraftKey =
        formData.ai_provider === 'openrouter'
            ? formData.openrouter_api_key
            : formData.ai_provider === 'openai'
                ? formData.openai_api_key
                : formData.gemini_api_key
    const testKeyLabel = activeDraftKey.trim()
        ? 'Test New Key'
        : savedKeys[formData.ai_provider]
            ? 'Test Saved Key'
            : 'Test Key'
    const recommendationClassMap = {
        cost: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/90",
        balanced: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/90",
        quality: "border-amber-300/20 bg-amber-400/10 text-amber-100/90",
    } as const

    const renderModelTips = (options: AIModelOption[]) => (
        <div className="grid gap-2 md:grid-cols-3">
            {options.map((option) => (
                <div
                    key={option.id}
                    className={`rounded-xl border p-3 text-xs ${recommendationClassMap[option.recommendation]}`}
                >
                    <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span className="font-medium">{option.label}</span>
                        <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]">
                            {getModelRecommendationLabel(option.recommendation)}
                        </span>
                    </div>
                    <p className="text-white/75">{option.summary}</p>
                </div>
            ))}
        </div>
    )

    return (
        <Card className={panelClass}>
            <CardHeader className="border-b border-white/8 pb-5">
                <CardTitle className="text-white/90">Provider credentials & reply model</CardTitle>
                <CardDescription className="text-white/50">
                    Select the provider, encrypted credential, and model defaults used by AI automation nodes.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-400/8 p-3 text-sm text-cyan-100/90">
                    <span className="font-medium">BYOK:</span> SwiftFlow uses your own provider credentials for AI usage. API keys are encrypted before storage, provider usage charges stay on your account, and teams keep direct control over usage limits, billing visibility, and model-level spend.
                </div>
                {!canEditSettings && (
                    <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-400/8 p-3 text-sm text-amber-100/90">
                        Read-only access: only admins and owners can change AI provider settings and API keys.
                    </div>
                )}
                <fieldset
                    disabled={!canEditSettings}
                    className={`m-0 min-w-0 border-0 p-0 ${!canEditSettings ? "pointer-events-none opacity-70" : ""}`}
                >
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_provider" className="text-white/80">AI Provider</Label>
                        <Select value={formData.ai_provider} onValueChange={handleProviderChange}>
                            <SelectTrigger id="ai_provider" className={selectTriggerClass}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={selectContentClass}>
                                <SelectItem value="openrouter">OpenRouter</SelectItem>
                                <SelectItem value="gemini">Google Gemini</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className={helperClass}>
                            OpenRouter is the preferred provider for model switching. Gemini and OpenAI remain available for automation replies.
                        </p>
                    </div>

                    {/* OpenRouter API Key */}
                    {formData.ai_provider === 'openrouter' && (
                        <div className="space-y-2">
                            <Label htmlFor="openrouter_api_key" className="text-white/80">
                                OpenRouter API Key
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="openrouter_api_key"
                                    type={showOpenRouterKey ? "text" : "password"}
                                    value={formData.openrouter_api_key}
                                    onChange={(e) => {
                                        setTestResult(null)
                                        setFormData((prev) => ({ ...prev, openrouter_api_key: e.target.value }))
                                    }}
                                    placeholder={hasSavedOpenRouterKey ? "Saved key on file. Enter a new key to replace it." : "sk-or-v1-..."}
                                    className={`${fieldClass} pr-10`}
                                    required={formData.ai_provider === 'openrouter' && !hasSavedOpenRouterKey}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full text-white/55 hover:bg-white/5 hover:text-white/80"
                                    onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                                >
                                    {showOpenRouterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className={helperClass}>
                                    Get your API key from{" "}
                                    <a
                                        href="https://openrouter.ai/settings/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-300 hover:text-cyan-200 hover:underline"
                                    >
                                        OpenRouter Settings
                                    </a>
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-cyan-300 hover:text-cyan-200 hover:bg-white/5"
                                    onClick={handleTestKey}
                                    disabled={isTesting}
                                >
                                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    {testKeyLabel}
                                </Button>
                            </div>
                            {hasSavedOpenRouterKey && (
                                <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className={helperClass}>
                                        An OpenRouter key is already saved securely. Leave this blank to keep it, or enter a new key to replace it.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="w-full shrink-0 border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:text-red-200 sm:w-auto"
                                        onClick={() => setRemovingProvider('openrouter')}
                                    >
                                        Remove saved key
                                    </Button>
                                </div>
                            )}
                            {testResult && formData.ai_provider === 'openrouter' && (
                                <div className={`flex items-center gap-1.5 text-xs mt-1 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {testResult.valid
                                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> API key is valid</>
                                        : <><XCircle className="h-3.5 w-3.5" /> {testResult.error}</>
                                    }
                                </div>
                            )}
                        </div>
                    )}

                    {/* Gemini API Key */}
                    {formData.ai_provider === 'gemini' && (
                        <div className="space-y-2">
                            <Label htmlFor="gemini_api_key" className="text-white/80">
                                Gemini API Key
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="gemini_api_key"
                                    type={showGeminiKey ? "text" : "password"}
                                    value={formData.gemini_api_key}
                                    onChange={(e) => {
                                        setTestResult(null)
                                        setFormData((prev) => ({ ...prev, gemini_api_key: e.target.value }))
                                    }}
                                    placeholder={hasSavedGeminiKey ? "Saved key on file. Enter a new key to replace it." : "AIzaSy..."}
                                    className={`${fieldClass} pr-10`}
                                    required={formData.ai_provider === 'gemini' && !hasSavedGeminiKey}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full text-white/55 hover:bg-white/5 hover:text-white/80"
                                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                                >
                                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className={helperClass}>
                                    Get your API key from{" "}
                                    <a
                                        href="https://makersuite.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-300 hover:text-cyan-200 hover:underline"
                                    >
                                        Google AI Studio
                                    </a>
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-cyan-300 hover:text-cyan-200 hover:bg-white/5"
                                    onClick={handleTestKey}
                                    disabled={isTesting}
                                >
                                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    {testKeyLabel}
                                </Button>
                            </div>
                            {hasSavedGeminiKey && (
                                <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className={helperClass}>
                                        A Gemini key is already saved securely. Leave this blank to keep it, or enter a new key to replace it.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="w-full shrink-0 border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:text-red-200 sm:w-auto"
                                        onClick={() => setRemovingProvider('gemini')}
                                    >
                                        Remove saved key
                                    </Button>
                                </div>
                            )}
                            {testResult && formData.ai_provider === 'gemini' && (
                                <div className={`flex items-center gap-1.5 text-xs mt-1 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {testResult.valid
                                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> API key is valid</>
                                        : <><XCircle className="h-3.5 w-3.5" /> {testResult.error}</>
                                    }
                                </div>
                            )}
                        </div>
                    )}

                    {/* OpenAI API Key */}
                    {formData.ai_provider === 'openai' && (
                        <div className="space-y-2">
                            <Label htmlFor="openai_api_key" className="text-white/80">
                                OpenAI API Key
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="openai_api_key"
                                    type={showOpenAIKey ? "text" : "password"}
                                    value={formData.openai_api_key}
                                    onChange={(e) => {
                                        setTestResult(null)
                                        setFormData((prev) => ({ ...prev, openai_api_key: e.target.value }))
                                    }}
                                    placeholder={hasSavedOpenAIKey ? "Saved key on file. Enter a new key to replace it." : "sk-..."}
                                    className={`${fieldClass} pr-10`}
                                    required={formData.ai_provider === 'openai' && !hasSavedOpenAIKey}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full text-white/55 hover:bg-white/5 hover:text-white/80"
                                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                                >
                                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className={helperClass}>
                                    Get your API key from{" "}
                                    <a
                                        href="https://platform.openai.com/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-300 hover:text-cyan-200 hover:underline"
                                    >
                                        OpenAI Platform
                                    </a>
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-cyan-300 hover:text-cyan-200 hover:bg-white/5"
                                    onClick={handleTestKey}
                                    disabled={isTesting}
                                >
                                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    {testKeyLabel}
                                </Button>
                            </div>
                            {hasSavedOpenAIKey && (
                                <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className={helperClass}>
                                        An OpenAI key is already saved securely. Leave this blank to keep it, or enter a new key to replace it.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="w-full shrink-0 border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:text-red-200 sm:w-auto"
                                        onClick={() => setRemovingProvider('openai')}
                                    >
                                        Remove saved key
                                    </Button>
                                </div>
                            )}
                            {testResult && formData.ai_provider === 'openai' && (
                                <div className={`flex items-center gap-1.5 text-xs mt-1 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {testResult.valid
                                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> API key is valid</>
                                        : <><XCircle className="h-3.5 w-3.5" /> {testResult.error}</>
                                    }
                                </div>
                            )}
                        </div>
                    )}

                    {/* Text Model */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_text_model_name" className="text-white/80">Text Generation Model</Label>
                        <Select
                            value={resolvedTextModelName}
                            onValueChange={(value) => setFormData({ ...formData, ai_text_model_name: value })}
                            disabled={isTextModelsLoading || textModelOptions.length === 0}
                        >
                            <SelectTrigger id="ai_text_model_name" className={selectTriggerClass}>
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent className={selectContentClass}>
                                {textModelOptions.map((model) => (
                                    <SelectItem key={model} value={model}>
                                        {model}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className={helperClass}>
                            {textModelsData?.source === 'live'
                                ? 'Loaded from provider API using exact model IDs.'
                                : 'Using fallback model list. Save API key first to load account-specific models.'}
                        </p>
                        {renderModelTips(curatedTextModels)}
                    </div>

                    {showAdvancedSamplingControls ? (
                        <>
                            {/* Temperature */}
                            <div className="space-y-2">
                                <Label htmlFor="ai_temperature" className="text-white/80">
                                    Temperature: {formData.ai_temperature}
                                </Label>
                                <Input
                                    id="ai_temperature"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={formData.ai_temperature}
                                    onChange={(e) => setFormData({ ...formData, ai_temperature: parseFloat(e.target.value) })}
                                    className={fieldClass}
                                />
                                <p className={helperClass}>
                                    Lower values make output more focused, higher values more creative
                                </p>
                            </div>

                            {/* Max Tokens */}
                            <div className="space-y-2">
                                <Label htmlFor="ai_max_tokens" className="text-white/80">Max Tokens</Label>
                                <Input
                                    id="ai_max_tokens"
                                    type="number"
                                    min="256"
                                    max="8192"
                                    step="256"
                                    value={formData.ai_max_tokens}
                                    onChange={(e) => setFormData({ ...formData, ai_max_tokens: parseInt(e.target.value) })}
                                    className={fieldClass}
                                />
                                <p className={helperClass}>
                                    Maximum length of generated responses (256-8192)
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/8 p-3 text-sm text-cyan-100/90">
                            OpenRouter mode keeps sampling and token limits behind the scenes so the main settings stay focused on provider and model choice.
                        </div>
                    )}

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Settings
                            </>
                        )}
                    </Button>

                    {!settings && (
                        <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/8 p-3 text-sm">
                            <p className="text-cyan-100/90">
                                💡 First time setup: Add your API key to enable AI features
                            </p>
                        </div>
                    )}
                </form>
                </fieldset>
                <AlertDialog open={!!removingProvider} onOpenChange={(open) => !open && !isLoading && setRemovingProvider(null)}>
                    <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white/90">Remove saved API key?</AlertDialogTitle>
                            <AlertDialogDescription className="text-white/55">
                                This will delete the saved {removingProvider === 'openai' ? 'OpenAI' : removingProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'} API key for this workspace.
                                AI features for that provider will stop working until you add a new key.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                disabled={isLoading}
                                className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleRemoveSavedKey}
                                className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                                disabled={isLoading}
                            >
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Remove key
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    )
}
