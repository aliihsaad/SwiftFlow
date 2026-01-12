"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Facebook, Instagram } from "lucide-react"

interface CalendarPost {
    date: Date
    platform: string
}

interface CalendarViewProps {
    posts: CalendarPost[]
}

export function CalendarView({ posts }: CalendarViewProps) {
    // Generate days for the view (mocking current month logic for simplicity, 
    // in real app we'd need date-fns to generate actual calendar grid based on current month)
    const days = Array.from({ length: 35 }, (_, i) => {
        const dayNum = i + 1
        const isCurrentMonth = i >= 3 && i <= 33 // Mock offset

        // Find posts for this relative day (mock logic)
        // In reality, we'd match date strings
        const dayPosts = posts.filter(p => {
            // Just spread them out for demo if dates aren't real, or match if they are
            // For now, let's just show posts if the day matches the date's day number
            return p.date.getDate() === (dayNum - 2) // adjusting for mock offset
        })

        return { day: isCurrentMonth ? (i - 2) : "", posts: dayPosts, isCurrentMonth }
    })

    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Content Calendar</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden border border-border">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="bg-background p-2 text-center text-xs font-semibold text-muted-foreground">
                            {day}
                        </div>
                    ))}
                    {days.map((day, i) => (
                        <div
                            key={i}
                            className={cn(
                                "min-h-[100px] bg-background p-2 relative transition-colors hover:bg-muted/50",
                                !day.isCurrentMonth && "bg-muted/30 text-muted-foreground"
                            )}
                        >
                            <div className="text-sm font-medium mb-1">{day.day}</div>
                            <div className="space-y-1">
                                {day.posts.map((post, idx) => (
                                    <div key={idx} className="flex items-center gap-1 text-[10px] bg-accent/50 p-1 rounded border border-border/50">
                                        {post.platform === 'instagram' ? <Instagram className="h-3 w-3 text-pink-600" /> : <Facebook className="h-3 w-3 text-blue-600" />}
                                        <span className="truncate">{post.date.getHours()}:00</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
