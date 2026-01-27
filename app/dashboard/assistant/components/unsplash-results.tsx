"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ExternalLink, Check } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface UnsplashPhoto {
    id: string
    url: string
    thumb: string
    fullUrl: string
    width: number
    height: number
    description: string | null
    photographer: {
        name: string
        username: string
        profileUrl: string
        portfolioUrl?: string
    }
    downloadLink: string
    color: string
}

interface UnsplashResultsProps {
    results: UnsplashPhoto[]
    query: string
    onSelect: (photo: UnsplashPhoto) => void
    selectedId?: string
}

export function UnsplashResults({ results, query, onSelect, selectedId }: UnsplashResultsProps) {
    if (results.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p>No images found for "{query}"</p>
                <p className="text-sm mt-2">Try a different search term</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Found {results.length} photos for "{query}"
                </p>
            </div>

            <ScrollArea className="h-[500px] pr-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {results.map((photo) => (
                        <Card
                            key={photo.id}
                            className={`group relative overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary ${selectedId === photo.id ? 'ring-2 ring-primary' : ''
                                }`}
                            onClick={() => onSelect(photo)}
                        >
                            {/* Image */}
                            <div className="aspect-square relative">
                                <img
                                    src={photo.thumb}
                                    alt={photo.description || `Photo by ${photo.photographer.name}`}
                                    className="w-full h-full object-cover"
                                    style={{ backgroundColor: photo.color }}
                                />

                                {/* Selected Indicator */}
                                {selectedId === photo.id && (
                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                        <div className="bg-primary text-primary-foreground rounded-full p-2">
                                            <Check className="w-6 h-6" />
                                        </div>
                                    </div>
                                )}

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                        <p className="text-xs font-medium truncate">
                                            Photo by{' '}
                                            <a
                                                href={photo.photographer.profileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline hover:text-primary"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {photo.photographer.name}
                                            </a>
                                        </p>
                                        {photo.description && (
                                            <p className="text-xs opacity-80 truncate mt-1">
                                                {photo.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </ScrollArea>

            {/* Attribution Footer */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <span>Photos from</span>
                <a
                    href="https://unsplash.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:text-primary inline-flex items-center gap-1"
                >
                    Unsplash
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        </div>
    )
}
