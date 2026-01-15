"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Facebook, Instagram, ChevronLeft, ChevronRight, GripVertical } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    useDroppable,
    useDraggable
} from '@dnd-kit/core'
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"

interface CalendarPost {
    id: string
    date: Date
    platforms: string[]
    content?: string | null
    mediaUrl?: string | null
}

interface CalendarViewProps {
    posts: CalendarPost[]
}

// Draggable Post Badge Component
function DraggablePostBadge({ post, index }: { post: CalendarPost, index: number }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `post-${post.id}`,
        data: { post }
    })

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Popover>
                        <PopoverTrigger asChild>
                            <div
                                ref={setNodeRef}
                                {...listeners}
                                {...attributes}
                                className="h-9 w-9 rounded-md bg-cover bg-center transition-transform hover:scale-110 cursor-grab active:cursor-grabbing shadow-sm border border-border relative group"
                                style={{
                                    backgroundColor: !post.mediaUrl ? (post.platforms.includes('instagram') ? '#E1306C' : post.platforms.includes('facebook') ? '#1877F2' : '#888') : undefined,
                                    backgroundImage: post.mediaUrl ? `url(${post.mediaUrl})` : undefined,
                                    ...style
                                }}
                            >
                                {!post.mediaUrl && (
                                    <div className="w-full h-full flex items-center justify-center opacity-50">
                                        <div className="h-2.5 w-2.5 rounded-full bg-white" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                    <GripVertical className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                </div>
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
                </TooltipTrigger>
                <TooltipContent side="top">
                    <p>Drag to reschedule</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// Droppable Calendar Cell Component
function DroppableCalendarCell({
    day,
    isCurrentMonth,
    isToday,
    isPast,
    posts,
    currentYear,
    currentMonth,
    isOver
}: {
    day: number | null
    isCurrentMonth: boolean
    isToday: boolean
    isPast: boolean
    posts: CalendarPost[]
    currentYear: number
    currentMonth: number
    isOver: boolean
}) {
    // Only make cell droppable if it's not a past date
    const { setNodeRef } = useDroppable({
        id: day ? `cell-${currentYear}-${currentMonth}-${day}` : `empty-${Math.random()}`,
        data: { day, month: currentMonth, year: currentYear },
        disabled: isPast
    })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "min-h-[100px] bg-background p-2 relative transition-colors flex flex-col gap-1",
                !isCurrentMonth && "bg-muted/30",
                isToday && "bg-blue-50/50 dark:bg-blue-900/10 ring-1 ring-inset ring-blue-500/50",
                isPast && "bg-muted/50 opacity-60 cursor-not-allowed",
                isOver && day && !isPast && "bg-primary/10 ring-2 ring-primary/50"
            )}
        >
            {day && (
                <>
                    <div className="flex justify-between items-start">
                        <span className={cn(
                            "text-xs font-medium",
                            isToday && "text-blue-600 dark:text-blue-400 font-bold",
                            isPast && "text-muted-foreground"
                        )}>
                            {day}
                        </span>
                        {posts.length > 0 && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-sm font-medium">
                                {posts.length}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap content-start gap-1 mt-1">
                        {posts.map((post, idx) => (
                            <DraggablePostBadge key={post.id} post={post} index={idx} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

export function CalendarView({ posts }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [activeId, setActiveId] = useState<string | null>(null)
    const [overId, setOverId] = useState<string | null>(null)
    const [localPosts, setLocalPosts] = useState<CalendarPost[]>(posts)
    const router = useRouter()
    const { toast } = useToast()

    // Sync local state when props change (e.g., after router.refresh())
    useEffect(() => {
        setLocalPosts(posts)
    }, [posts])

    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth()
    const today = new Date()

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    )

    // Get first day of month (0-6, Sun-Sat)
    const firstDay = new Date(currentYear, currentMonth, 1).getDay()

    // Get days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    // Create grid array (padding start + days)
    const gridCells = []

    // Add empty cells for days before start of month
    for (let i = 0; i < firstDay; i++) {
        gridCells.push({ day: null, isCurrentMonth: false, isPast: false, posts: [] })
    }

    // Add actual days - use localPosts for immediate visual feedback
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day)
        // Check if this date is in the past (before today)
        const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
        // Find posts for this day from local state
        const dayPosts = localPosts.filter(p => {
            const pDate = new Date(p.date)
            return pDate.getDate() === day &&
                pDate.getMonth() === currentMonth &&
                pDate.getFullYear() === currentYear
        })
        gridCells.push({ day, isCurrentMonth: true, isPast, posts: dayPosts })
    }

    // Pad end to make full rows (optional, but looks better)
    while (gridCells.length % 7 !== 0) {
        gridCells.push({ day: null, isCurrentMonth: false, isPast: false, posts: [] })
    }

    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    const isToday = (day: number | null) =>
        day === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear === today.getFullYear()

    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
    }

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
    }

    const goToToday = () => {
        setCurrentDate(new Date())
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragOver = (event: any) => {
        setOverId(event.over?.id || null)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        setOverId(null)

        if (!over) return

        const postData = active.data.current?.post as CalendarPost
        const cellData = over.data.current

        if (!postData || !cellData?.day) return

        // Calculate new date
        const newDate = new Date(cellData.year, cellData.month, cellData.day)

        // Prevent dropping on past dates
        const today = new Date()
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (newDate < todayStart) {
            toast({
                title: "Invalid date",
                description: "Cannot schedule posts in the past",
                variant: "destructive"
            })
            return
        }

        // Preserve the original time
        const originalDate = new Date(postData.date)
        newDate.setHours(originalDate.getHours())
        newDate.setMinutes(originalDate.getMinutes())
        newDate.setSeconds(originalDate.getSeconds())

        // Store original posts for potential rollback
        const previousPosts = [...localPosts]

        // Optimistic update - update local state immediately
        setLocalPosts(prevPosts =>
            prevPosts.map(p =>
                p.id === postData.id ? { ...p, date: newDate } : p
            )
        )

        // Update post via API in background
        try {
            const response = await fetch('/api/posts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: postData.id,
                    scheduledAt: newDate.toISOString()
                })
            })

            if (!response.ok) throw new Error('Failed to update post')

            toast({
                title: "Post rescheduled",
                description: `Moved to ${newDate.toLocaleDateString()}`,
            })

            // Refresh in background to sync with server
            router.refresh()
        } catch (error) {
            // Revert optimistic update on error
            setLocalPosts(previousPosts)
            toast({
                title: "Error",
                description: "Failed to reschedule post",
                variant: "destructive"
            })
        }
    }

    const activePost = activeId ? localPosts.find(p => `post-${p.id}` === activeId) : null

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Content Calendar</CardTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={goToToday}
                                className="text-xs"
                            >
                                Today
                            </Button>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={goToPreviousMonth}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="min-w-[140px] text-center text-sm font-medium">
                                    {monthName}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={goToNextMonth}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden border border-border">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                            <div key={day} className="bg-background p-2 text-center text-xs font-semibold text-muted-foreground">
                                {day}
                            </div>
                        ))}
                        {gridCells.map((cell, i) => (
                            <DroppableCalendarCell
                                key={i}
                                day={cell.day}
                                isCurrentMonth={cell.isCurrentMonth}
                                isToday={cell.day ? isToday(cell.day) : false}
                                isPast={cell.isPast || false}
                                posts={cell.posts}
                                currentYear={currentYear}
                                currentMonth={currentMonth}
                                isOver={overId === (cell.day ? `cell-${currentYear}-${currentMonth}-${cell.day}` : '')}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>
            <DragOverlay>
                {activePost && (
                    <div className="h-6 w-6 rounded-md shadow-lg opacity-80">
                        <div
                            className="h-full w-full rounded-md"
                            style={{
                                backgroundColor: !activePost.mediaUrl ? (activePost.platforms.includes('instagram') ? '#E1306C' : activePost.platforms.includes('facebook') ? '#1877F2' : '#888') : undefined,
                                backgroundImage: activePost.mediaUrl ? `url(${activePost.mediaUrl})` : undefined,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }}
                        />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    )
}
