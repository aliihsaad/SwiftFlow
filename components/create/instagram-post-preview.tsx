"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface InstagramPostPreviewProps {
    caption: string
    mediaUrls: string[]
    username?: string
    userImage?: string
    location?: string
}

export function InstagramPostPreview({ caption, mediaUrls, username = "you", userImage, location }: InstagramPostPreviewProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    const hasMultipleImages = mediaUrls.length > 1

    const nextImage = () => {
        if (currentImageIndex < mediaUrls.length - 1) {
            setCurrentImageIndex(prev => prev + 1)
        }
    }

    const prevImage = () => {
        if (currentImageIndex > 0) {
            setCurrentImageIndex(prev => prev - 1)
        }
    }

    return (
        <div className="w-full max-w-[400px] mx-auto bg-white dark:bg-black border rounded-xl overflow-hidden shadow-sm font-sans">
            {/* Header */}
            <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 ring-2 ring-transparent">
                        <AvatarImage src={userImage} />
                        <AvatarFallback className="bg-gradient-to-tr from-yellow-400 to-fuchsia-600 text-white font-bold text-xs">
                            {username[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col -gap-0.5">
                        <span className="text-sm font-semibold leading-none">{username}</span>
                        {location && <span className="text-xs text-muted-foreground">{location}</span>}
                    </div>
                </div>
                <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
            </div>

            {/* Media */}
            <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900 group select-none">
                {mediaUrls.length > 0 ? (
                    <>
                        {mediaUrls[currentImageIndex].match(/\.(mp4|webm|ogg|mov)$/i) ? (
                            <video
                                src={mediaUrls[currentImageIndex]}
                                className="w-full h-full object-cover"
                                controls
                            />
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={mediaUrls[currentImageIndex]}
                                alt="Post content"
                                className="w-full h-full object-cover"
                            />
                        )}

                        {hasMultipleImages && (
                            <>
                                {currentImageIndex > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); prevImage() }}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 opacity-70 hover:opacity-100 transition-opacity"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                )}
                                {currentImageIndex < mediaUrls.length - 1 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); nextImage() }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 opacity-70 hover:opacity-100 transition-opacity"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                                    {currentImageIndex + 1}/{mediaUrls.length}
                                </div>

                                {/* Pagination Dots */}
                                <div className="absolute bottom-[-20px] left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                                    {mediaUrls.map((_, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                "h-1.5 rounded-full transition-all shadow-sm",
                                                idx === currentImageIndex ? "w-1.5 bg-blue-500" : "w-1.5 bg-zinc-300 dark:bg-zinc-700"
                                            )}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center w-full h-full text-muted-foreground bg-muted/30 flex-col gap-2">
                        <div className="h-12 w-12 rounded-full border-2 border-dashed border-muted-foreground/50" />
                        <span className="text-sm">No media selected</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="p-3 pb-1">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                        <Heart className="h-6 w-6 stroke-[1.5] hover:text-muted-foreground cursor-pointer" />
                        <MessageCircle className="h-6 w-6 stroke-[1.5] -rotate-90 hover:text-muted-foreground cursor-pointer" />
                        <Send className="h-6 w-6 stroke-[1.5] hover:text-muted-foreground cursor-pointer" />
                    </div>
                    <Bookmark className="h-6 w-6 stroke-[1.5] hover:text-muted-foreground cursor-pointer" />
                </div>

                {/* Likes Placeholder */}
                <div className="text-sm font-semibold mb-2">
                    12 likes
                </div>

                {/* Caption */}
                <div className="text-sm leading-relaxed">
                    <span className="font-semibold mr-2">{username}</span>
                    <span className="whitespace-pre-wrap">{caption}</span>
                    {/* Hashtags highlighting could go here */}
                </div>

                {/* Date */}
                <div className="text-[10px] text-zinc-500 uppercase mt-2 mb-1">
                    2 hours ago
                </div>
            </div>

            {/* Add Comment */}
            <div className="px-3 py-3 border-t mt-1 flex items-center gap-3">
                <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[8px] bg-zinc-100 dark:bg-zinc-800">ME</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">Add a comment...</span>
            </div>
        </div>
    )
}
