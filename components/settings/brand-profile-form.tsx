"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { X, Plus, Loader2, Info } from "lucide-react"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"

const DEFAULT_BRAND_COLORS = {
    enabled: true,
    primary: "#000000",
    secondary: "#666666",
    accent: "#0066CC",
}

interface BrandProfileFormProps {
    workspaceId: string
}

type BrandService = {
    name: string
    description: string
}

type BrandProfileState = {
    workspace_id?: string
    business_name?: string
    owner_name?: string
    email?: string
    phone?: string
    website?: string
    industry?: string
    business_description?: string
    target_audience?: string
    brand_voice?: string
    language?: string
    services?: BrandService[]
    unique_selling_points?: string[]
    logo_url?: string
    brand_colors?: Partial<typeof DEFAULT_BRAND_COLORS>
    reference_image_urls?: string[]
    instagram_handle?: string
    content_themes?: string[]
}

type BrandAssetUploadResponse = {
    url?: string
    error?: string
}

async function requestBrandProfile(): Promise<BrandProfileState> {
    const response = await fetch('/api/brand-profile')
    if (!response.ok) {
        const text = await response.text()
        console.error('API Error:', response.status, text)
        throw new Error(`API Error: ${response.status}`)
    }
    return response.json()
}

export function BrandProfileForm({ workspaceId }: BrandProfileFormProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [profile, setProfile] = useState<BrandProfileState | null>(null)
    const [newService, setNewService] = useState("")
    const [newUSP, setNewUSP] = useState("")
    const [newTheme, setNewTheme] = useState("")
    const { toast } = useToast()
    const canEditSettings = useWorkspacePermission("settings:write")

    useEffect(() => {
        let cancelled = false

        void requestBrandProfile()
            .then((data) => {
                if (!cancelled) setProfile(data)
            })
            .catch((error) => {
                if (!cancelled) console.error('Failed to fetch profile:', error)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [workspaceId])

    const handleSave = async () => {
        if (!canEditSettings) return
        setSaving(true)
        try {
            const res = await fetch('/api/brand-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile)
            })

            if (!res.ok) throw new Error('Failed to save')

            toast({
                title: "Brand profile saved",
                description: "Your brand profile was updated successfully.",
            })
        } catch (error) {
            console.error('Save error:', error)
            toast({
                title: "Save failed",
                description: "Failed to save brand profile.",
                variant: "destructive",
            })
        } finally {
            setSaving(false)
        }
    }

    const updateField = (field: string, value: unknown) => {
        if (!canEditSettings) return
        setProfile((prev) => ({
            ...(prev || {}),
            [field]: value,
        }))
    }

    const addService = () => {
        if (!newService.trim()) return
        const services = profile?.services || []
        updateField('services', [...services, { name: newService, description: '' }])
        setNewService("")
    }

    const removeService = (index: number) => {
        const services = [...(profile?.services || [])]
        services.splice(index, 1)
        updateField('services', services)
    }

    const addUSP = () => {
        if (!newUSP.trim()) return
        const usps = profile?.unique_selling_points || []
        updateField('unique_selling_points', [...usps, newUSP])
        setNewUSP("")
    }

    const removeUSP = (index: number) => {
        const usps = [...(profile?.unique_selling_points || [])]
        usps.splice(index, 1)
        updateField('unique_selling_points', usps)
    }

    const addTheme = () => {
        if (!newTheme.trim()) return
        const themes = profile?.content_themes || []
        updateField('content_themes', [...themes, newTheme])
        setNewTheme("")
    }

    const removeTheme = (index: number) => {
        const themes = [...(profile?.content_themes || [])]
        themes.splice(index, 1)
        updateField('content_themes', themes)
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEditSettings) return
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const formData = new FormData()
            formData.append('kind', 'logo')
            formData.append('file', file)

            const response = await fetch('/api/brand-profile/assets', {
                method: 'POST',
                body: formData,
            })

            const payload = await response.json().catch(() => null) as BrandAssetUploadResponse | null
            if (!response.ok || !payload?.url) {
                throw new Error(payload?.error || 'Failed to upload logo')
            }

            updateField('logo_url', payload.url)
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                title: "Upload failed",
                description: error instanceof Error ? error.message : "Failed to upload logo.",
                variant: "destructive",
            })
        } finally {
            e.target.value = ''
        }
    }

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEditSettings) return
        const files = e.target.files
        if (!files) return

        try {
            const urls = []
            for (const file of Array.from(files)) {
                const formData = new FormData()
                formData.append('kind', 'reference')
                formData.append('file', file)

                const response = await fetch('/api/brand-profile/assets', {
                    method: 'POST',
                    body: formData,
                })

                const payload = await response.json().catch(() => null) as BrandAssetUploadResponse | null
                if (!response.ok || !payload?.url) {
                    throw new Error(payload?.error || 'Failed to upload reference image')
                }

                urls.push(payload.url)
            }

            const existing = profile?.reference_image_urls || []
            updateField('reference_image_urls', [...existing, ...urls])
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                title: "Upload failed",
                description: error instanceof Error ? error.message : "Failed to upload images.",
                variant: "destructive",
            })
        } finally {
            e.target.value = ''
        }
    }

    const removeReferenceImage = (index: number) => {
        const images = [...(profile?.reference_image_urls || [])]
        images.splice(index, 1)
        updateField('reference_image_urls', images)
    }

    const getBrandColors = () => ({
        ...DEFAULT_BRAND_COLORS,
        ...(profile?.brand_colors || {}),
    })

    const updateBrandColors = (next: Partial<typeof DEFAULT_BRAND_COLORS>) => {
        updateField('brand_colors', {
            ...getBrandColors(),
            ...next,
        })
    }

    const panelClass = "border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]"
    const inputClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const textareaClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const selectTriggerClass = "border-white/10 bg-[#1b1d28] text-white/85"
    const selectContentClass = "border-white/10 bg-[#1b1d28] text-white/85"
    const labelClass = "text-white/75"
    const chipClass = "gap-1 border border-cyan-300/15 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
    const addIconBtnClass = "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
    const readOnlyBlockClass = !canEditSettings ? "pointer-events-none opacity-70" : ""

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {!canEditSettings && (
                <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 p-4 text-amber-100/90">
                    <p className="flex items-start gap-2 text-sm">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Read-only access: only admins and owners can edit the brand profile and upload brand assets.</span>
                    </p>
                </div>
            )}

            <fieldset disabled={!canEditSettings} className={`m-0 min-w-0 border-0 p-0 ${readOnlyBlockClass}`}>
                <div
                    className="space-y-6
                    **:data-[slot=card-title]:text-white/90
                    **:data-[slot=card-description]:text-white/50
                    **:data-[slot=input]:border-white/10
                    **:data-[slot=input]:bg-[#1b1d28]
                    **:data-[slot=input]:text-white/85
                    **:data-[slot=input]:placeholder:text-white/25
                    **:data-[slot=textarea]:border-white/10
                    **:data-[slot=textarea]:bg-[#1b1d28]
                    **:data-[slot=textarea]:text-white/85
                    **:data-[slot=textarea]:placeholder:text-white/25
                    **:data-[slot=select-trigger]:border-white/10
                    **:data-[slot=select-trigger]:bg-[#1b1d28]
                    **:data-[slot=select-trigger]:text-white/85
                    **:data-[slot=badge]:border-white/10"
                >
            {/* Business Identity */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Business Identity</CardTitle>
                    <CardDescription>Basic information about your business</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label className={labelClass}>Business Name</Label>
                            <Input
                                className={inputClass}
                                value={profile?.business_name || ''}
                                onChange={(e) => updateField('business_name', e.target.value)}
                                placeholder="Acme Corp"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className={labelClass}>Owner Name</Label>
                            <Input
                                className={inputClass}
                                value={profile?.owner_name || ''}
                                onChange={(e) => updateField('owner_name', e.target.value)}
                                placeholder="John Doe"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label className={labelClass}>Email</Label>
                            <Input
                                className={inputClass}
                                type="email"
                                value={profile?.email || ''}
                                onChange={(e) => updateField('email', e.target.value)}
                                placeholder="contact@acme.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className={labelClass}>Phone</Label>
                            <Input
                                className={inputClass}
                                value={profile?.phone || ''}
                                onChange={(e) => updateField('phone', e.target.value)}
                                placeholder="+1 (555) 123-4567"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className={labelClass}>Website</Label>
                        <Input
                            className={inputClass}
                            value={profile?.website || ''}
                            onChange={(e) => updateField('website', e.target.value)}
                            placeholder="https://acme.com"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Business Details */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Business Details</CardTitle>
                    <CardDescription>Information to help AI understand your brand</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className={labelClass}>Industry</Label>
                        <Input
                            className={inputClass}
                            value={profile?.industry || ''}
                            onChange={(e) => updateField('industry', e.target.value)}
                            placeholder="E-commerce, Healthcare, Technology..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className={labelClass}>Business Description</Label>
                        <Textarea
                            className={textareaClass}
                            value={profile?.business_description || ''}
                            onChange={(e) => updateField('business_description', e.target.value)}
                            placeholder="Describe what your business does..."
                            rows={4}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className={labelClass}>Target Audience</Label>
                        <Textarea
                            className={textareaClass}
                            value={profile?.target_audience || ''}
                            onChange={(e) => updateField('target_audience', e.target.value)}
                            placeholder="Who are your ideal customers?"
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label className={labelClass}>Brand Voice</Label>
                            <Select
                                value={profile?.brand_voice || 'professional'}
                                onValueChange={(value) => updateField('brand_voice', value)}
                            >
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="professional">Professional</SelectItem>
                                    <SelectItem value="casual">Casual</SelectItem>
                                    <SelectItem value="friendly">Friendly</SelectItem>
                                    <SelectItem value="authoritative">Authoritative</SelectItem>
                                    <SelectItem value="playful">Playful</SelectItem>
                                    <SelectItem value="inspirational">Inspirational</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className={labelClass}>Language</Label>
                            <Select
                                value={profile?.language || 'en'}
                                onValueChange={(value) => updateField('language', value)}
                            >
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="es">Spanish</SelectItem>
                                    <SelectItem value="fr">French</SelectItem>
                                    <SelectItem value="de">German</SelectItem>
                                    <SelectItem value="it">Italian</SelectItem>
                                    <SelectItem value="pt">Portuguese</SelectItem>
                                    <SelectItem value="nl">Dutch</SelectItem>
                                    <SelectItem value="ar">Arabic</SelectItem>
                                    <SelectItem value="zh">Chinese</SelectItem>
                                    <SelectItem value="ja">Japanese</SelectItem>
                                    <SelectItem value="ko">Korean</SelectItem>
                                    <SelectItem value="hi">Hindi</SelectItem>
                                    <SelectItem value="ru">Russian</SelectItem>
                                    <SelectItem value="tr">Turkish</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Services */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Services & Offerings</CardTitle>
                    <CardDescription>What products or services do you offer?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            className={inputClass}
                            value={newService}
                            onChange={(e) => setNewService(e.target.value)}
                            placeholder="Add a service..."
                            onKeyDown={(e) => e.key === 'Enter' && addService()}
                        />
                        <Button onClick={addService} size="icon" className={addIconBtnClass}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {profile?.services?.map((service: BrandService, i: number) => (
                            <Badge key={i} variant="secondary" className={chipClass}>
                                {service.name}
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => removeService(i)}
                                />
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* USPs */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Unique Selling Points</CardTitle>
                    <CardDescription>What makes you different?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            className={inputClass}
                            value={newUSP}
                            onChange={(e) => setNewUSP(e.target.value)}
                            placeholder="Add a USP..."
                            onKeyDown={(e) => e.key === 'Enter' && addUSP()}
                        />
                        <Button onClick={addUSP} size="icon" className={addIconBtnClass}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {profile?.unique_selling_points?.map((usp: string, i: number) => (
                            <Badge key={i} variant="secondary" className={chipClass}>
                                {usp}
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => removeUSP(i)}
                                />
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Brand Assets */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Brand Assets</CardTitle>
                    <CardDescription>Logo and reference images</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className={labelClass}>Logo</Label>
                        <div className="flex items-center gap-4">
                            {profile?.logo_url && (
                                <>
                                {/* User-configured image hosts intentionally bypass the Next image proxy. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={profile.logo_url} alt="Logo" className="h-16 w-16 object-contain rounded border border-white/10 bg-[#1b1d28] p-2" />
                                </>
                            )}
                            <Input
                                className={inputClass}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className={labelClass}>Reference Images</Label>
                        <Input
                            className={inputClass}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleReferenceUpload}
                        />
                        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {profile?.reference_image_urls?.map((url: string, i: number) => (
                                <div key={i} className="relative group">
                                    {/* User-configured image hosts intentionally bypass the Next image proxy. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`Reference ${i + 1}`} className="w-full aspect-square object-cover rounded border border-white/10" />
                                    <button
                                        onClick={() => removeReferenceImage(i)}
                                        className="absolute top-1 right-1 rounded-full border border-red-400/25 bg-red-500/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Brand Colors */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Brand Colors</CardTitle>
                    <CardDescription>Define your palette and control whether AI image generation should use it as prompt context</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                        <div className="space-y-1">
                            <Label className={labelClass}>Use colors in AI context</Label>
                            <p className="text-sm text-white/45">
                                When enabled, AI image generation will include these colors in the prompt context.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={getBrandColors().enabled}
                            onClick={() => updateBrandColors({ enabled: !getBrandColors().enabled })}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                                getBrandColors().enabled
                                    ? "border-cyan-300/30 bg-cyan-400/20"
                                    : "border-white/10 bg-white/10"
                            }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                                    getBrandColors().enabled ? "translate-x-6" : "translate-x-1"
                                }`}
                            />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* Primary Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Primary</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <Input
                                    type="color"
                                    value={getBrandColors().primary}
                                    onChange={(e) => updateBrandColors({ primary: e.target.value })}
                                    className="h-10 w-14 shrink-0 cursor-pointer rounded border border-white/10 bg-[#1b1d28] p-1"
                                />
                                <Input
                                    value={getBrandColors().primary}
                                    onChange={(e) => updateBrandColors({ primary: e.target.value })}
                                    placeholder="#000000"
                                    className={`${inputClass} w-32 font-mono text-sm`}
                                />
                            </div>
                        </div>

                        {/* Secondary Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Secondary</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <Input
                                    type="color"
                                    value={getBrandColors().secondary}
                                    onChange={(e) => updateBrandColors({ secondary: e.target.value })}
                                    className="h-10 w-14 shrink-0 cursor-pointer rounded border border-white/10 bg-[#1b1d28] p-1"
                                />
                                <Input
                                    value={getBrandColors().secondary}
                                    onChange={(e) => updateBrandColors({ secondary: e.target.value })}
                                    placeholder="#666666"
                                    className={`${inputClass} w-32 font-mono text-sm`}
                                />
                            </div>
                        </div>

                        {/* Accent Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Accent</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <Input
                                    type="color"
                                    value={getBrandColors().accent}
                                    onChange={(e) => updateBrandColors({ accent: e.target.value })}
                                    className="h-10 w-14 shrink-0 cursor-pointer rounded border border-white/10 bg-[#1b1d28] p-1"
                                />
                                <Input
                                    value={getBrandColors().accent}
                                    onChange={(e) => updateBrandColors({ accent: e.target.value })}
                                    placeholder="#0066CC"
                                    className={`${inputClass} w-32 font-mono text-sm`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Color Palette Preview */}
                    <div className="pt-4 border-t border-white/10">
                        <Label className={`mb-2 block ${labelClass}`}>Color Palette Preview</Label>
                        <div className="flex gap-2">
                            <div
                                className="h-16 flex-1 rounded-lg border-2 border-white/15 shadow-sm"
                                style={{ backgroundColor: getBrandColors().primary }}
                            />
                            <div
                                className="h-16 flex-1 rounded-lg border-2 border-white/15 shadow-sm"
                                style={{ backgroundColor: getBrandColors().secondary }}
                            />
                            <div
                                className="h-16 flex-1 rounded-lg border-2 border-white/15 shadow-sm"
                                style={{ backgroundColor: getBrandColors().accent }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Social Media */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Social Media</CardTitle>
                    <CardDescription>Your Instagram presence</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label className={labelClass}>Instagram Handle</Label>
                            <Input
                                className={inputClass}
                                value={profile?.instagram_handle || ''}
                                onChange={(e) => updateField('instagram_handle', e.target.value)}
                                placeholder="@yourbrand"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className={labelClass}>Content Themes</Label>
                        <div className="flex gap-2">
                            <Input
                                className={inputClass}
                                value={newTheme}
                                onChange={(e) => setNewTheme(e.target.value)}
                                placeholder="Add a theme..."
                                onKeyDown={(e) => e.key === 'Enter' && addTheme()}
                            />
                            <Button onClick={addTheme} size="icon" className={addIconBtnClass}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {profile?.content_themes?.map((theme: string, i: number) => (
                                <Badge key={i} variant="secondary" className={chipClass}>
                                    {theme}
                                    <X
                                        className="h-3 w-3 cursor-pointer"
                                        onClick={() => removeTheme(i)}
                                    />
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    size="lg"
                    className="border border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Brand Profile
                </Button>
            </div>
                </div>
            </fieldset>
        </div>
    )
}
