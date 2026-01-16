"use client"

import { Button } from "@/components/ui/button"
import { Sparkles, Search } from "lucide-react"

interface ImageSourceSelectorProps {
    onSourceSelect: (source: 'ai' | 'unsplash') => void
    selectedSource?: 'ai' | 'unsplash'
}

export function ImageSourceSelector({ onSourceSelect, selectedSource }: ImageSourceSelectorProps) {
    return (
        <div className="flex gap-3 w-full">
            <Button
                variant={selectedSource === 'ai' ? 'default' : 'outline'}
                className="flex-1 h-auto py-4 flex-col gap-2"
                onClick={() => onSourceSelect('ai')}
            >
                <Sparkles className="w-5 h-5" />
                <div className="text-center">
                    <div className="font-semibold">AI Generate</div>
                    <div className="text-xs opacity-80">Create custom images</div>
                </div>
            </Button>

            <Button
                variant={selectedSource === 'unsplash' ? 'default' : 'outline'}
                className="flex-1 h-auto py-4 flex-col gap-2"
                onClick={() => onSourceSelect('unsplash')}
            >
                <Search className="w-5 h-5" />
                <div className="text-center">
                    <div className="font-semibold">Search Unsplash</div>
                    <div className="text-xs opacity-80">Free stock photos</div>
                </div>
            </Button>
        </div>
    )
}
