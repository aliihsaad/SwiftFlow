"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { X, Plus, Upload, Loader2 } from "lucide-react"

interface BrandProfileFormProps {
    workspaceId: string
}

export function BrandProfileForm({ workspaceId }: BrandProfileFormProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [profile, setProfile] = useState<any>(null)
    const [newService, setNewService] = useState("")
    const [newUSP, setNewUSP] = useState("")
    const [newTheme, setNewTheme] = useState("")
    const supabase = createClient()
    const { toast } = useToast()

    useEffect(() => {
        fetchProfile()
    }, [workspaceId])

    const fetchProfile = async () => {
        try {
            const res = await fetch('/api/brand-profile')
            if (!res.ok) {
                const text = await res.text()
                console.error('API Error:', res.status, text)
                throw new Error(`API Error: ${res.status}`)
            }
            const data = await res.json()
            setProfile(data)
        } catch (error) {
            console.error('Failed to fetch profile:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
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

    const updateField = (field: string, value: any) => {
        setProfile({ ...profile, [field]: value })
    }

    const addService = () => {
        if (!newService.trim()) return
        const services = profile.services || []
        updateField('services', [...services, { name: newService, description: '' }])
        setNewService("")
    }

    const removeService = (index: number) => {
        const services = [...profile.services]
        services.splice(index, 1)
        updateField('services', services)
    }

    const addUSP = () => {
        if (!newUSP.trim()) return
        const usps = profile.unique_selling_points || []
        updateField('unique_selling_points', [...usps, newUSP])
        setNewUSP("")
    }

    const removeUSP = (index: number) => {
        const usps = [...profile.unique_selling_points]
        usps.splice(index, 1)
        updateField('unique_selling_points', usps)
    }

    const addTheme = () => {
        if (!newTheme.trim()) return
        const themes = profile.content_themes || []
        updateField('content_themes', [...themes, newTheme])
        setNewTheme("")
    }

    const removeTheme = (index: number) => {
        const themes = [...profile.content_themes]
        themes.splice(index, 1)
        updateField('content_themes', themes)
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `logo-${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('brand_assets')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('brand_assets')
                .getPublicUrl(fileName)

            updateField('logo_url', data.publicUrl)
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                title: "Upload failed",
                description: "Failed to upload logo.",
                variant: "destructive",
            })
        }
    }

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return

        try {
            const urls = []
            for (const file of Array.from(files)) {
                const fileExt = file.name.split('.').pop()
                const fileName = `ref-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

                const { error: uploadError } = await supabase.storage
                    .from('brand_assets')
                    .upload(fileName, file)

                if (uploadError) throw uploadError

                const { data } = supabase.storage
                    .from('brand_assets')
                    .getPublicUrl(fileName)

                urls.push(data.publicUrl)
            }

            const existing = profile.reference_image_urls || []
            updateField('reference_image_urls', [...existing, ...urls])
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                title: "Upload failed",
                description: "Failed to upload images.",
                variant: "destructive",
            })
        }
    }

    const removeReferenceImage = (index: number) => {
        const images = [...(profile.reference_image_urls || [])]
        images.splice(index, 1)
        updateField('reference_image_urls', images)
    }

    const panelClass = "border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]"
    const inputClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const textareaClass = "border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-300/20"
    const selectTriggerClass = "border-white/10 bg-[#1b1d28] text-white/85"
    const selectContentClass = "border-white/10 bg-[#1b1d28] text-white/85"
    const labelClass = "text-white/75"
    const chipClass = "gap-1 border border-cyan-300/15 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
    const addIconBtnClass = "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            </div>
        )
    }

    return (
        <div
            className="space-y-6
            [&_[data-slot=card-title]]:text-white/90
            [&_[data-slot=card-description]]:text-white/50
            [&_[data-slot=input]]:border-white/10
            [&_[data-slot=input]]:bg-[#1b1d28]
            [&_[data-slot=input]]:text-white/85
            [&_[data-slot=input]]:placeholder:text-white/25
            [&_[data-slot=textarea]]:border-white/10
            [&_[data-slot=textarea]]:bg-[#1b1d28]
            [&_[data-slot=textarea]]:text-white/85
            [&_[data-slot=textarea]]:placeholder:text-white/25
            [&_[data-slot=select-trigger]]:border-white/10
            [&_[data-slot=select-trigger]]:bg-[#1b1d28]
            [&_[data-slot=select-trigger]]:text-white/85
            [&_[data-slot=badge]]:border-white/10"
        >
            {/* Business Identity */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Business Identity</CardTitle>
                    <CardDescription>Basic information about your business</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        {profile?.services?.map((service: any, i: number) => (
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
                                <img src={profile.logo_url} alt="Logo" className="h-16 w-16 object-contain rounded border border-white/10 bg-[#1b1d28] p-2" />
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
                    <CardDescription>Define your brand color palette for AI-generated content</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        {/* Primary Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Primary</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <div
                                    className="h-10 w-10 shrink-0 rounded border-2 border-white/20"
                                    style={{ backgroundColor: profile?.brand_colors?.primary || '#000000' }}
                                />
                                <Input
                                    value={profile?.brand_colors?.primary || '#000000'}
                                    onChange={(e) => updateField('brand_colors', {
                                        primary: e.target.value,
                                        secondary: profile?.brand_colors?.secondary || '#666666',
                                        accent: profile?.brand_colors?.accent || '#0066CC'
                                    })}
                                    placeholder="#000000"
                                    className={`${inputClass} w-32 font-mono text-sm`}
                                />
                            </div>
                        </div>

                        {/* Secondary Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Secondary</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <div
                                    className="h-10 w-10 shrink-0 rounded border-2 border-white/20"
                                    style={{ backgroundColor: profile?.brand_colors?.secondary || '#666666' }}
                                />
                                <Input
                                    value={profile?.brand_colors?.secondary || '#666666'}
                                    onChange={(e) => updateField('brand_colors', {
                                        primary: profile?.brand_colors?.primary || '#000000',
                                        secondary: e.target.value,
                                        accent: profile?.brand_colors?.accent || '#0066CC'
                                    })}
                                    placeholder="#666666"
                                    className={`${inputClass} w-32 font-mono text-sm`}
                                />
                            </div>
                        </div>

                        {/* Accent Color */}
                        <div className="flex items-center gap-4">
                            <Label className={`w-24 ${labelClass}`}>Accent</Label>
                            <div className="flex items-center gap-2 flex-1">
                                <div
                                    className="h-10 w-10 shrink-0 rounded border-2 border-white/20"
                                    style={{ backgroundColor: profile?.brand_colors?.accent || '#0066CC' }}
                                />
                                <Input
                                    value={profile?.brand_colors?.accent || '#0066CC'}
                                    onChange={(e) => updateField('brand_colors', {
                                        primary: profile?.brand_colors?.primary || '#000000',
                                        secondary: profile?.brand_colors?.secondary || '#666666',
                                        accent: e.target.value
                                    })}
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
                                style={{ backgroundColor: profile?.brand_colors?.primary || '#000000' }}
                            />
                            <div
                                className="h-16 flex-1 rounded-lg border-2 border-white/15 shadow-sm"
                                style={{ backgroundColor: profile?.brand_colors?.secondary || '#666666' }}
                            />
                            <div
                                className="h-16 flex-1 rounded-lg border-2 border-white/15 shadow-sm"
                                style={{ backgroundColor: profile?.brand_colors?.accent || '#0066CC' }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Social Media */}
            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle>Social Media</CardTitle>
                    <CardDescription>Your social media presence</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label className={labelClass}>Instagram Handle</Label>
                            <Input
                                className={inputClass}
                                value={profile?.instagram_handle || ''}
                                onChange={(e) => updateField('instagram_handle', e.target.value)}
                                placeholder="@yourbrand"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className={labelClass}>Facebook Page</Label>
                            <Input
                                className={inputClass}
                                value={profile?.facebook_page || ''}
                                onChange={(e) => updateField('facebook_page', e.target.value)}
                                placeholder="facebook.com/yourbrand"
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
                    className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Brand Profile
                </Button>
            </div>
        </div>
    )
}
