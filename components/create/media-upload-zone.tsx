import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, Video, Image as ImageIcon, Wand2, ArrowUp } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface MediaUploadZoneProps {
    mediaUrls: string[]
    onMediaChange: (urls: string[]) => void
    onAiGenerate?: (prompt: string) => void
    isGenerating?: boolean
}

export function MediaUploadZone({ mediaUrls, onMediaChange, onAiGenerate, isGenerating }: MediaUploadZoneProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [aiPrompt, setAiPrompt] = useState("")
    const supabase = createClient()

    // --- Dropping Logic (Reused) ---
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        setIsUploading(true)
        const newUrls: string[] = []
        try {
            for (const file of acceptedFiles) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`

                const { error: uploadError } = await supabase.storage
                    .from('post_media')
                    .upload(`${fileName}`, file)

                if (uploadError) throw uploadError

                const { data } = supabase.storage
                    .from('post_media')
                    .getPublicUrl(`${fileName}`)

                newUrls.push(data.publicUrl)
            }
            onMediaChange([...mediaUrls, ...newUrls])
        } catch (error) {
            console.error('Upload error:', error)
        } finally {
            setIsUploading(false)
        }
    }, [mediaUrls, onMediaChange, supabase.storage])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [], 'video/*': [] }
    })

    const removeMedia = (index: number) => {
        const newUrls = [...mediaUrls]
        newUrls.splice(index, 1)
        onMediaChange(newUrls)
    }

    // --- AI Handler ---
    const handleAiSubmit = () => {
        if (!aiPrompt.trim() || !onAiGenerate) return
        onAiGenerate(aiPrompt)
        setAiPrompt("")
    }

    return (
        <div className="space-y-4">

            {/* Split View Dropzones */}
            {mediaUrls.length === 0 ? (
                <div className="grid grid-cols-2 gap-4">
                    {/* Left: Standard Upload */}
                    <div
                        {...getRootProps()}
                        className={cn(
                            "group border border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all h-[180px]",
                            isDragActive
                                ? "border-primary bg-primary/5"
                                : "border-muted-foreground/20 hover:border-foreground/40 hover:bg-muted/30"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="p-3 rounded-full bg-muted group-hover:bg-background transition-colors">
                            <Upload className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                            Drag & drop images or a video here, or click to select
                        </p>
                    </div>

                    {/* Right: AI Generate Zone */}
                    <div className="border border-dashed border-muted-foreground/20 rounded-xl p-4 flex flex-col justify-between h-[180px] hover:bg-muted/30 transition-colors relative group bg-muted/10">
                        {/* Placeholder / Visuals */}
                        <div className="flex flex-col items-center justify-center flex-1 gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Wand2 className="h-5 w-5 text-purple-500" />
                            <p className="text-sm text-muted-foreground text-center">
                                Describe or drag & drop an image...
                            </p>
                        </div>

                        {/* Integrated Input */}
                        <div className="relative mt-2">
                            <input
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Describe image to generate..."
                                className="w-full bg-background border rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
                            />
                            <Button
                                size="icon"
                                className="absolute right-1 top-1 h-7 w-7 rounded-sm"
                                onClick={handleAiSubmit}
                                disabled={!aiPrompt.trim() || isGenerating}
                            >
                                {isGenerating ? <Wand2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
                            </Button>
                        </div>

                        {/* Magic Icon Watermark */}
                        <Wand2 className="absolute top-4 right-4 h-4 w-4 text-purple-500 opacity-20" />
                    </div>
                </div>
            ) : (
                /* Media Previews (Full Width when content exists) */
                <div className="relative aspect-video w-full rounded-xl overflow-hidden border bg-black/90 group">
                    {/* Just showing first one as hero for now to match UI image look */}
                    {mediaUrls[0].match(/\.(mp4|webm|ogg)$/i) ? (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="h-12 w-12 text-white/50" />
                        </div>
                    ) : (
                        <img src={mediaUrls[0]} alt="Hero" className="w-full h-full object-contain" />
                    )}

                    <button
                        onClick={() => removeMedia(0)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-red-500/80 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Thumbnail list if multiple (Overlay) */}
                    {mediaUrls.length > 1 && (
                        <div className="absolute bottom-4 left-4 flex gap-2">
                            {mediaUrls.slice(1).map((url, i) => (
                                <div key={i} className="w-12 h-12 rounded-md border border-white/20 overflow-hidden bg-black/50">
                                    <img src={url} className="w-full h-full object-cover opacity-70" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
