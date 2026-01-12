"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Facebook, Instagram } from "lucide-react"

interface CalendarPost {
    date: Date
    platforms: string[]
    content?: string | null
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

    return (
        <Card className="col-span-3">
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
                                "min-h-[100px] bg-background p-2 relative transition-colors hover:bg-muted/50",
                                !cell.isCurrentMonth && "bg-muted/30"
                            )}
                        >
                            {cell.day && (
                                <>
                                    <div className="text-sm font-medium mb-1">{cell.day}</div>
                                    <div className="space-y-1">
                                        {cell.posts.map((post, idx) => (
                                            <div key={idx} className="flex items-center gap-1 text-[10px] bg-accent/50 p-1 rounded border border-border/50" title={post.content || ''}>
                                                <div className="flex -space-x-1">
                                                    {post.platforms.includes('facebook') && (
                                                        <div className="bg-white rounded-full p-0.5 z-10">
                                                            <Facebook className="h-3 w-3 text-blue-600" />
                                                        </div>
                                                    )}
                                                    {post.platforms.includes('instagram') && (
                                                        <div className="bg-white rounded-full p-0.5 z-20">
                                                            <Instagram className="h-3 w-3 text-pink-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="truncate">
                                                    {post.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
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
