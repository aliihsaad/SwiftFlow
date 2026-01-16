import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, X, Wand2, ArrowUp, GripVertical, Search, Check } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface MediaUploadZoneProps {
    mediaUrls: string[]
    onMediaChange: (urls: string[]) => void
    onAiGenerate?: (prompt: string) => void
    isGenerating?: boolean
}

// --- Sortable Item Component ---
function SortableMediaItem({ url, index, onRemove }: { url: string, index: number, onRemove: (index: number) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: url })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none' as const,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="relative aspect-square rounded-xl overflow-hidden border bg-muted group"
        >
            {/* Drag Handle - Always visible for touch support */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-2 left-2 z-30 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-grab active:cursor-grabbing backdrop-blur-sm"
            >
                <GripVertical className="h-3 w-3" />
            </div>

            {url.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                <video
                    src={url}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                    muted
                />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full object-cover"
                />
            )}

            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onRemove(index)
                }}
                className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/50 text-white hover:bg-red-500/90 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm cursor-pointer"
            >
                <X className="h-3 w-3" />
            </button>

            <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium pointer-events-none">
                {index + 1}
            </div>
        </div>
    )
}

export function MediaUploadZone({ mediaUrls, onMediaChange, onAiGenerate, isGenerating }: MediaUploadZoneProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [aiPrompt, setAiPrompt] = useState("")
    const supabase = createClient()

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 }
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 150, tolerance: 5 }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

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

    // --- Drag Handler ---
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = mediaUrls.indexOf(active.id as string)
            const newIndex = mediaUrls.indexOf(over.id as string)

            onMediaChange(arrayMove(mediaUrls, oldIndex, newIndex))
        }
    }

    // --- AI Handler ---
    const handleAiSubmit = () => {
        if (!aiPrompt.trim() || !onAiGenerate) return
        onAiGenerate(aiPrompt)
        setAiPrompt("")
    }

    // --- Unsplash State & Handlers ---
    const [unsplashQuery, setUnsplashQuery] = useState("")
    const [unsplashResults, setUnsplashResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [selectedUnsplashIds, setSelectedUnsplashIds] = useState<Set<string>>(new Set())
    const { toast } = useToast()

    const handleUnsplashSearch = async () => {
        if (!unsplashQuery.trim()) return

        setIsSearching(true)
        try {
            const { data, error } = await supabase.functions.invoke('search-unsplash', {
                body: { query: unsplashQuery, count: 4 }
            })

            if (error) throw new Error(error.message)
            if (data?.error) throw new Error(data.error)

            setUnsplashResults(data?.result?.data || [])
        } catch (e: any) {
            toast({ title: "Search failed", description: e.message, variant: "destructive" })
        } finally {
            setIsSearching(false)
        }
    }

    const handleUnsplashSelect = (photo: any) => {
        const newSelected = new Set(selectedUnsplashIds)
        if (newSelected.has(photo.id)) {
            newSelected.delete(photo.id)
        } else {
            newSelected.add(photo.id)
        }
        setSelectedUnsplashIds(newSelected)
    }

    const handleAddSelectedUnsplash = async () => {
        const selectedPhotos = unsplashResults.filter(p => selectedUnsplashIds.has(p.id))
        const newUrls: string[] = []

        for (const photo of selectedPhotos) {
            try {
                const { data } = await supabase.functions.invoke('select-unsplash-image', {
                    body: {
                        unsplashId: photo.id,
                        downloadLocation: photo.downloadLink,
                        photographer: photo.photographer
                    }
                })

                if (data?.result?.imageUrl) {
                    newUrls.push(data.result.imageUrl)
                }
            } catch (e) {
                console.error('Failed to add Unsplash image:', e)
            }
        }

        if (newUrls.length > 0) {
            onMediaChange([...mediaUrls, ...newUrls])
            setSelectedUnsplashIds(new Set())
            toast({ title: "Images added!", description: `Added ${newUrls.length} photo(s) from Unsplash` })
        }
    }

    return (
        <div className="space-y-4">

            {/* Tabbed Upload Interface */}
            {mediaUrls.length < 10 && (
                <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="upload" className="gap-2">
                            <Upload className="h-4 w-4" />
                            Upload
                        </TabsTrigger>
                        <TabsTrigger value="ai" className="gap-2">
                            <Wand2 className="h-4 w-4" />
                            AI Generate
                        </TabsTrigger>
                        <TabsTrigger value="unsplash" className="gap-2">
                            <Search className="h-4 w-4" />
                            Unsplash
                        </TabsTrigger>
                    </TabsList>

                    {/* Upload Tab */}
                    <TabsContent value="upload" className="mt-4">
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
                    </TabsContent>

                    {/* AI Generate Tab */}
                    <TabsContent value="ai" className="mt-4">
                        <div className="border border-dashed border-muted-foreground/20 rounded-xl p-4 flex flex-col justify-between h-[180px] hover:bg-muted/30 transition-colors relative group bg-muted/10">
                            <div className="flex flex-col items-center justify-center flex-1 gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                <Wand2 className="h-5 w-5 text-purple-500" />
                                <p className="text-sm text-muted-foreground text-center">
                                    Describe the image you want to generate
                                </p>
                            </div>

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

                            <Wand2 className="absolute top-4 right-4 h-4 w-4 text-purple-500 opacity-20" />
                        </div>
                    </TabsContent>

                    {/* Unsplash Tab */}
                    <TabsContent value="unsplash" className="mt-4">
                        <div className="border rounded-xl overflow-hidden">
                            {/* Search Bar */}
                            <div className="p-4 border-b bg-muted/30">
                                <div className="relative">
                                    <Input
                                        value={unsplashQuery}
                                        onChange={(e) => setUnsplashQuery(e.target.value)}
                                        placeholder="Search Unsplash photos..."
                                        className="pr-10"
                                        onKeyDown={(e) => e.key === 'Enter' && handleUnsplashSearch()}
                                    />
                                    <Button
                                        size="icon"
                                        className="absolute right-1 top-1 h-7 w-7"
                                        onClick={handleUnsplashSearch}
                                        disabled={!unsplashQuery.trim() || isSearching}
                                    >
                                        {isSearching ? <Wand2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                                    </Button>
                                </div>
                            </div>

                            {/* Results Grid */}
                            <ScrollArea className="h-[300px]">
                                {unsplashResults.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2 p-4">
                                        {unsplashResults.map((photo) => (
                                            <div
                                                key={photo.id}
                                                onClick={() => handleUnsplashSelect(photo)}
                                                className={cn(
                                                    "relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary group",
                                                    selectedUnsplashIds.has(photo.id) && "ring-2 ring-primary"
                                                )}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={photo.thumb}
                                                    alt={photo.description || `Photo by ${photo.photographer.name}`}
                                                    className="w-full h-full object-cover"
                                                    style={{ backgroundColor: photo.color }}
                                                />

                                                {/* Selection Indicator */}
                                                {selectedUnsplashIds.has(photo.id) && (
                                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                                                            <Check className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Photographer Attribution */}
                                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-[10px] text-white truncate">
                                                        {photo.photographer.name}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                                        {isSearching ? "Searching..." : "Search for photos to get started"}
                                    </div>
                                )}
                            </ScrollArea>

                            {/* Add Selected Button */}
                            {selectedUnsplashIds.size > 0 && (
                                <div className="p-4 border-t bg-muted/30">
                                    <Button
                                        onClick={handleAddSelectedUnsplash}
                                        className="w-full"
                                    >
                                        Add {selectedUnsplashIds.size} Selected Photo{selectedUnsplashIds.size > 1 ? 's' : ''}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            )}

            {/* Media Gallery Grid - Now Sortable */}
            {mediaUrls.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={mediaUrls}
                        strategy={rectSortingStrategy}
                    >
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {mediaUrls.map((url, i) => (
                                <SortableMediaItem
                                    key={url}
                                    url={url}
                                    index={i}
                                    onRemove={removeMedia}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    )
}
