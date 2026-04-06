"use client"

import { useState, useRef } from "react"
import { Upload, X, Film, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function MediaUpload() {
    const [isDragOver, setIsDragOver] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(true)
    }

    const handleDragLeave = () => {
        setIsDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        if (e.dataTransfer.files?.[0]) {
            setFile(e.dataTransfer.files[0])
        }
    }

    const handleFileClick = () => {
        inputRef.current?.click()
    }

    return (
        <div className="space-y-4">
            <label className="text-sm font-medium">Media</label>

            {!file ? (
                <div
                    onClick={handleFileClick}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        "border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-colors",
                        isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    )}
                >
                    <input
                        type="file"
                        ref={inputRef}
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                    />
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-center">
                        Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                        JPG, PNG, MP4 (Max 1080x1080)
                    </p>
                </div>
            ) : (
                <div className="relative rounded-lg overflow-hidden border">
                    {file.type.startsWith('image') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-64 object-cover" />
                    ) : (
                        <div className="h-64 bg-black flex items-center justify-center">
                            <Film className="h-12 w-12 text-white/50" />
                        </div>
                    )}
                    <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-2 right-2 h-8 w-8 rounded-full"
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
