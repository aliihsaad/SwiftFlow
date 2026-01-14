"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Facebook, Instagram } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface CalendarPost {
    date: Date
    platforms: string[]
    content?: string | null
    mediaUrl?: string | null
}

interface CalendarViewProps {
    posts: CalendarPost[]
}

export function CalendarView({ posts }: CalendarViewProps) {
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()

    // Get first day of month (0-6, Sun-Sat)
    const firstDay = new Date(currentYear, currentMonth, 1).getDay()

    // Get days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    // Create grid array (padding start + days)
    const gridCells = []

    // Add empty cells for days before start of month
    for (let i = 0; i < firstDay; i++) {
        gridCells.push({ day: null, isCurrentMonth: false, posts: [] })
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day)
        // Find posts for this day
        const dayPosts = posts.filter(p => {
            const pDate = new Date(p.date)
            return pDate.getDate() === day &&
                pDate.getMonth() === currentMonth &&
                pDate.getFullYear() === currentYear
        })
        gridCells.push({ day, isCurrentMonth: true, posts: dayPosts })
    }

    // Pad end to make full rows (optional, but looks better)
    while (gridCells.length % 7 !== 0) {
        gridCells.push({ day: null, isCurrentMonth: false, posts: [] })
    }

    const monthName = today.toLocaleString('default', { month: 'long' })
    const isToday = (day: number | null) => day === today.getDate() && currentMonth === today.getMonth()

    return (
        <Card>
            <CardHeader>
                <CardTitle>Content Calendar ({monthName})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden border border-border">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="bg-background p-2 text-center text-xs font-semibold text-muted-foreground">
                            {day}
                        </div>
                    ))}
                    {gridCells.map((cell, i) => (
                        <div
                            key={i}
                            className={cn(
                                "min-h-[60px] bg-background p-2 relative transition-colors hover:bg-muted/50 flex flex-col gap-1",
                                !cell.isCurrentMonth && "bg-muted/30",
                                cell.day && isToday(cell.day) && "bg-blue-50/50 dark:bg-blue-900/10 ring-1 ring-inset ring-blue-500/50"
                            )}
                        >
                            {cell.day && (
                                <>
                                    <div className="flex justify-between items-start">
                                        <span className={cn(
                                            "text-xs font-medium",
                                            isToday(cell.day) && "text-blue-600 dark:text-blue-400 font-bold"
                                        )}>
                                            {cell.day}
                                        </span>
                                        {cell.posts.length > 0 && (
                                            <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-sm font-medium">
                                                {cell.posts.length}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap content-start gap-1 mt-1">
                                        {cell.posts.map((post, idx) => (
                                            <Popover key={idx}>
                                                <PopoverTrigger>
                                                    <div
                                                        className="h-6 w-6 rounded-md bg-cover bg-center transition-transform hover:scale-110 cursor-pointer shadow-sm border border-border"
                                                        style={{
                                                            backgroundColor: !post.mediaUrl ? (post.platforms.includes('instagram') ? '#E1306C' : post.platforms.includes('facebook') ? '#1877F2' : '#888') : undefined,
                                                            backgroundImage: post.mediaUrl ? `url(${post.mediaUrl})` : undefined
                                                        }}
                                                    >
                                                        {!post.mediaUrl && (
                                                            <div className="w-full h-full flex items-center justify-center opacity-50">
                                                                <div className="h-2 w-2 rounded-full bg-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-60 p-0 text-sm overflow-hidden">
                                                    {post.mediaUrl && (
                                                        <div className="w-full h-32 bg-muted relative">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={post.mediaUrl}
                                                                alt="Post preview"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="p-3">
                                                        <div className="font-semibold mb-1 flex items-center gap-2">
                                                            {post.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                            <div className="flex -space-x-1">
                                                                {post.platforms.includes('facebook') && <Facebook className="h-3 w-3 text-blue-600" />}
                                                                {post.platforms.includes('instagram') && <Instagram className="h-3 w-3 text-pink-600" />}
                                                            </div>
                                                        </div>
                                                        <p className="text-muted-foreground text-xs line-clamp-3">
                                                            {post.content || "No content"}
                                                        </p>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
