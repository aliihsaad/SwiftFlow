"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight, Battery, Wifi, Signal, ArrowLeft, Home, Search, PlusSquare, Clapperboard, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface InstagramPostPreviewProps {
    caption: string
    mediaUrls: string[]
    username?: string
    userImage?: string
    location?: string
    date?: Date
}

export function InstagramPostPreview({ caption, mediaUrls, username = "you", userImage, location, date }: InstagramPostPreviewProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    const hasMultipleImages = mediaUrls.length > 1

    // Format date like "14 January 2026" — use provided date or current date
    const displayDate = date || new Date()
    const formattedDate = displayDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    })

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
        <div className="w-[380px] mx-auto bg-black rounded-[3rem] border-8 border-zinc-800 overflow-hidden shadow-2xl font-sans relative aspect-9/19 select-none text-white">

            {/* Dynamic Island / Notch Area */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-2xl z-50"></div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-6 pt-3 pb-2 text-xs font-semibold z-40 relative">
                <span className="ml-2">12:29</span>
                <div className="flex items-center gap-1.5 mr-2">
                    <Signal className="h-3 w-3 fill-current" />
                    <Wifi className="h-3 w-3" />
                    <Battery className="h-3 w-3 fill-current" />
                </div>
            </div>

            {/* App Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black z-40 relative">
                <ChevronLeft className="h-6 w-6 stroke-2" />
                <div className="flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase">{username}</span>
                    <span className="text-sm font-bold -mt-0.5">Posts</span>
                </div>
                <div className="w-6"></div> {/* Spacer for alignment */}
            </div>

            {/* Scrollable Content Area */}
            <div className="bg-black text-white h-[calc(100%-140px)] overflow-y-auto no-scrollbar scroll-smooth relative">

                {/* Post Item */}
                <div className="pb-4">
                    {/* Post Header */}
                    <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 ring-2 ring-transparent">
                                <AvatarImage src={userImage} />
                                <AvatarFallback className="bg-linear-to-tr from-yellow-400 to-fuchsia-600 text-white font-bold text-xs">
                                    {username[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col -gap-0.5">
                                <span className="text-sm font-semibold leading-none">{username}</span>
                                {location && <span className="text-xs text-white/80">{location}</span>}
                            </div>
                        </div>
                        <MoreHorizontal className="h-5 w-5" />
                    </div>

                    {/* Media */}
                    <div className="relative aspect-square bg-zinc-900 group">
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
                                        <div className="absolute bottom-[-24px] left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-10">
                                            {mediaUrls.map((_, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "h-1.5 rounded-full transition-all shadow-sm",
                                                        idx === currentImageIndex ? "w-1.5 bg-blue-500" : "w-1.5 bg-zinc-700"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center w-full h-full text-zinc-500 flex-col gap-2">
                                <div className="h-12 w-12 rounded-full border-2 border-dashed border-zinc-700" />
                                <span className="text-sm">No media selected</span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="p-3 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-4">
                                <Heart className="h-6 w-6 stroke-2" />
                                <MessageCircle className="h-6 w-6 stroke-2 -rotate-90" />
                                <Send className="h-6 w-6 stroke-2" />
                            </div>
                            <Bookmark className="h-6 w-6 stroke-2" />
                        </div>

                        {/* Likes Placeholder */}
                        <div className="text-sm font-bold mb-2">
                            2 likes
                        </div>

                        {/* Caption */}
                        <div className="text-sm leading-relaxed">
                            <span className="font-bold mr-2">{username}</span>
                            <span className="whitespace-pre-wrap font-normal">{caption}</span>
                        </div>

                        {/* View Comments */}
                        <div className="text-sm text-zinc-500 mt-2 cursor-pointer">
                            View all comments
                        </div>

                        {/* Date */}
                        <div className="text-[10px] text-zinc-500 mt-1" suppressHydrationWarning>
                            {formattedDate}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="absolute bottom-0 left-0 right-0 bg-black border-t border-zinc-800 px-6 py-4 flex items-center justify-between z-40 pb-8">
                <Home className="h-6 w-6 stroke-2 fill-white" />
                <Search className="h-6 w-6 stroke-2" />
                <PlusSquare className="h-6 w-6 stroke-2" />
                <Clapperboard className="h-6 w-6 stroke-2" />
                <Avatar className="h-6 w-6 ring-1 ring-white">
                    <AvatarImage src={userImage} />
                    <AvatarFallback className="bg-zinc-800 text-[8px] text-white">U</AvatarFallback>
                </Avatar>
            </div>

            {/* Bottom Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full z-50"></div>
        </div>
    )
}
