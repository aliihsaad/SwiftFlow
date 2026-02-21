"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Eye, EyeOff, Save } from "lucide-react"
import { WorkspaceSettings } from "@/types/settings"
import { updateCurrentWorkspaceSettings } from "@/app/actions/settings"
import { toast } from "sonner"
import {
    getDefaultModelForProvider,
    getFallbackModelsForProvider,
    isAIProvider,
    type AIProvider,
} from "@/lib/ai-models"

interface ApiSettingsFormProps {
    settings: WorkspaceSettings | null
}

export function ApiSettingsForm({ settings }: ApiSettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [showGeminiKey, setShowGeminiKey] = useState(false)
    const [showOpenAIKey, setShowOpenAIKey] = useState(false)

    const initialProvider: AIProvider = isAIProvider(settings?.ai_provider || '')
        ? (settings!.ai_provider as AIProvider)
        : 'gemini'

    const [formData, setFormData] = useState({
        ai_provider: initialProvider,
        gemini_api_key: settings?.gemini_api_key || '',
        openai_api_key: settings?.openai_api_key || '',
        ai_model_name: settings?.ai_model_name || getDefaultModelForProvider(initialProvider),
        ai_temperature: settings?.ai_temperature || 0.7,
        ai_max_tokens: settings?.ai_max_tokens || 2048,
    })

    const fetcher = async (url: string) => {
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to fetch models')
        return data as { models?: string[]; source?: 'live' | 'fallback'; reason?: string }
    }

    const { data: modelsData, isLoading: isModelsLoading } = useSWR(
        `/api/ai/models?provider=${formData.ai_provider}`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    const modelOptions =
        Array.isArray(modelsData?.models) && modelsData.models.length > 0
            ? modelsData.models
            : getFallbackModelsForProvider(formData.ai_provider)

    useEffect(() => {
        const options =
            Array.isArray(modelsData?.models) && modelsData.models.length > 0
                ? modelsData.models
                : getFallbackModelsForProvider(formData.ai_provider)
        if (!options.length) return
        setFormData((prev) => {
            if (options.includes(prev.ai_model_name)) return prev
            return { ...prev, ai_model_name: options[0] }
        })
    }, [formData.ai_provider, modelsData?.models])

    const handleProviderChange = (value: string) => {
        const provider: AIProvider = value === 'openai' ? 'openai' : 'gemini'
        setFormData((prev) => ({
            ...prev,
            ai_provider: provider,
            ai_model_name: getDefaultModelForProvider(provider),
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            await updateCurrentWorkspaceSettings({
                ai_provider: formData.ai_provider,
                gemini_api_key: formData.gemini_api_key || undefined,
                openai_api_key: formData.openai_api_key || undefined,
                ai_model_name: formData.ai_model_name,
                ai_temperature: formData.ai_temperature,
                ai_max_tokens: formData.ai_max_tokens,
            })
            toast.success("Settings updated successfully!")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update settings"
            toast.error(message)
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI Provider Settings</CardTitle>
                <CardDescription>
                    Configure your AI provider and API keys for generating content
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_provider">AI Provider</Label>
                        <Select value={formData.ai_provider} onValueChange={handleProviderChange}>
                            <SelectTrigger id="ai_provider">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini">Google Gemini</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Select which AI provider to use for content generation
                        </p>
                    </div>

                    {/* Gemini API Key */}
                    {formData.ai_provider === 'gemini' && (
                        <div className="space-y-2">
                            <Label htmlFor="gemini_api_key">
                                Gemini API Key
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="gemini_api_key"
                                    type={showGeminiKey ? "text" : "password"}
                                    value={formData.gemini_api_key}
                                    onChange={(e) => setFormData({ ...formData, gemini_api_key: e.target.value })}
                                    placeholder="AIzaSy..."
                                    className="pr-10"
                                    required={formData.ai_provider === 'gemini'}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full"
                                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                                >
                                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Get your API key from{" "}
                                <a
                                    href="https://makersuite.google.com/app/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    Google AI Studio
                                </a>
                            </p>
                        </div>
                    )}

                    {/* OpenAI API Key */}
                    {formData.ai_provider === 'openai' && (
                        <div className="space-y-2">
                            <Label htmlFor="openai_api_key">
                                OpenAI API Key
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="openai_api_key"
                                    type={showOpenAIKey ? "text" : "password"}
                                    value={formData.openai_api_key}
                                    onChange={(e) => setFormData({ ...formData, openai_api_key: e.target.value })}
                                    placeholder="sk-..."
                                    className="pr-10"
                                    required={formData.ai_provider === 'openai'}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full"
                                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                                >
                                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Get your API key from{" "}
                                <a
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    OpenAI Platform
                                </a>
                            </p>
                        </div>
                    )}

                    {/* Model Name */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_model_name">Model Name</Label>
                        <Select
                            value={formData.ai_model_name}
                            onValueChange={(value) => setFormData({ ...formData, ai_model_name: value })}
                            disabled={isModelsLoading || modelOptions.length === 0}
                        >
                            <SelectTrigger id="ai_model_name">
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                {modelOptions.map((model) => (
                                    <SelectItem key={model} value={model}>
                                        {model}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {modelsData?.source === 'live'
                                ? 'Loaded from provider API using exact model IDs.'
                                : 'Using fallback model list. Save API key first to load account-specific models.'}
                        </p>
                    </div>

                    {/* Temperature */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_temperature">
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
                        />
                        <p className="text-xs text-muted-foreground">
                            Lower values make output more focused, higher values more creative
                        </p>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-2">
                        <Label htmlFor="ai_max_tokens">Max Tokens</Label>
                        <Input
                            id="ai_max_tokens"
                            type="number"
                            min="256"
                            max="8192"
                            step="256"
                            value={formData.ai_max_tokens}
                            onChange={(e) => setFormData({ ...formData, ai_max_tokens: parseInt(e.target.value) })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Maximum length of generated responses (256-8192)
                        </p>
                    </div>

                    {/* Submit Button */}
                    <Button type="submit" disabled={isLoading} className="w-full">
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
                        <div className="p-3 text-sm bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 rounded-md">
                            <p className="text-blue-800 dark:text-blue-200">
                                💡 First time setup: Add your API key to enable AI features
                            </p>
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>
    )
}
