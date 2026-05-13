"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Facebook, Instagram, ChevronLeft, ChevronRight, GripVertical, Plus, Clock, Sparkles } from "lucide-react"
import { classifySlotStrength } from "@/lib/content-intelligence/timing"
import type { RecommendedSlot } from "@/lib/content-intelligence/types"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverEvent,
    DragStartEvent,
    useDroppable,
    useDraggable
} from '@dnd-kit/core'
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { CreatePostModal } from "@/components/create/create-post-modal"

interface CalendarPost {
    id: string
    date: Date
    platforms: string[]
    content?: string | null
    mediaUrl?: string | null
}

interface CalendarViewProps {
    posts: CalendarPost[]
    workspaceId: string
}

const CAL_THEME = {
    panel: "#151620",
    panelAlt: "#10111a",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.88)",
    textMuted: "rgba(255,255,255,0.42)",
    cyan: "#22d3ee",
    amber: "#f59e0b",
    coral: "#fb7185",
}

// Draggable Post Badge Component
function DraggablePostBadge({ post }: { post: CalendarPost }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `post-${post.id}`,
        data: { post }
    })

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div
                    ref={setNodeRef}
                    {...listeners}
                    {...attributes}
                    className="h-7 w-7 sm:h-9 sm:w-9 rounded-md bg-cover bg-center transition-transform hover:scale-110 cursor-grab active:cursor-grabbing shadow-sm border border-border relative group"
                    style={{
                        backgroundColor: !post.mediaUrl ? (post.platforms.includes('instagram') ? '#E1306C' : post.platforms.includes('facebook') ? '#1877F2' : '#888') : undefined,
                        backgroundImage: post.mediaUrl ? `url(${post.mediaUrl})` : undefined,
                        touchAction: 'none',
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
                <div className="p-3" style={{ background: CAL_THEME.panel }}>
                    <div className="font-semibold mb-1 flex items-center gap-2">
                        {post.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        <div className="flex -space-x-1">
                            {post.platforms.includes('facebook') && <Facebook className="h-3 w-3 text-blue-600" />}
                            {post.platforms.includes('instagram') && <Instagram className="h-3 w-3 text-pink-600" />}
                        </div>
                    </div>
                    <p className="text-xs line-clamp-3" style={{ color: CAL_THEME.textMuted }}>
                        {post.content || "No content"}
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// Droppable Calendar Cell Component
function DroppableCalendarCell({
    day,
    cellIndex,
    isCurrentMonth,
    isToday,
    isPast,
    posts,
    currentYear,
    currentMonth,
    isOver,
    onAddPost,
    recommendedSlots = [],
    onAddRecommendedPost
}: {
    day: number | null
    cellIndex: number
    isCurrentMonth: boolean
    isToday: boolean
    isPast: boolean
    posts: CalendarPost[]
    currentYear: number
    currentMonth: number
    isOver: boolean
    onAddPost?: (date: Date) => void
    recommendedSlots?: RecommendedSlot[]
    onAddRecommendedPost?: (slot: RecommendedSlot) => void
}) {
    // Only make cell droppable if it's not a past date
    const { setNodeRef } = useDroppable({
        id: day ? `cell-${currentYear}-${currentMonth}-${day}` : `empty-${cellIndex}`,
        data: { day, month: currentMonth, year: currentYear },
        disabled: isPast
    })
    const topSlot = recommendedSlots[0] || null
    const slotTone = topSlot?.score && topSlot.score >= 80 ? "strong" : topSlot?.score && topSlot.score >= 60 ? "okay" : topSlot ? "weak" : null
    const slotAccent =
        slotTone === "strong"
            ? "rgba(16,185,129,0.28)"
            : slotTone === "okay"
                ? "rgba(245,158,11,0.22)"
                : slotTone === "weak"
                    ? "rgba(255,255,255,0.12)"
                    : "transparent"

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "min-h-[60px] sm:min-h-[100px] p-1 sm:p-2 relative transition-colors flex flex-col gap-1 group"
            )}
            style={{
                background: !isCurrentMonth
                    ? "rgba(255,255,255,0.015)"
                    : topSlot
                        ? `linear-gradient(180deg, ${slotAccent}, rgba(16,17,26,0.98) 42%)`
                        : CAL_THEME.panelAlt,
                opacity: isPast ? 0.6 : 1,
                cursor: isPast ? "not-allowed" : undefined,
                boxShadow: isToday ? "inset 0 0 0 1px rgba(34,211,238,0.35)" : undefined,
                outline: isOver && day && !isPast ? "2px solid rgba(245,158,11,0.28)" : undefined,
                outlineOffset: isOver && day && !isPast ? "-2px" : undefined,
            }}
        >
            {day && (
                <>
                    <div className="flex justify-between items-start">
                        <span
                            className="text-xs font-medium"
                            style={{
                                color: isToday ? CAL_THEME.cyan : (isPast ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.72)"),
                                fontWeight: isToday ? 700 : 500,
                            }}
                        >
                            {day}
                        </span>
                        <div className="flex items-center gap-1">
                            {topSlot && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex h-5 max-w-[72px] items-center gap-1 rounded px-1 text-[10px] font-medium"
                                            style={{
                                                background: slotTone === "strong" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.10)",
                                                color: slotTone === "strong" ? "#86efac" : "#fbbf24",
                                            }}
                                            onClick={(event) => {
                                                event.preventDefault()
                                                event.stopPropagation()
                                            }}
                                            title="Recommended time"
                                        >
                                            <Clock className="h-3 w-3 shrink-0" />
                                            <span className="hidden sm:inline">
                                                {new Date(topSlot.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-0 text-sm">
                                        <div className="space-y-3 p-3" style={{ background: CAL_THEME.panel }}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold" style={{ color: CAL_THEME.text }}>Recommended window</p>
                                                    <p className="text-xs capitalize" style={{ color: CAL_THEME.textMuted }}>{topSlot.confidence} confidence</p>
                                                </div>
                                                <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: "rgba(16,185,129,0.12)", color: "#86efac" }}>
                                                    {topSlot.score}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {recommendedSlots.slice(0, 2).map((slot) => (
                                                    <button
                                                        key={slot.startsAt}
                                                        type="button"
                                                        className="w-full rounded border px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                                                        style={{ borderColor: CAL_THEME.border }}
                                                        onClick={(event) => {
                                                            event.preventDefault()
                                                            event.stopPropagation()
                                                            onAddRecommendedPost?.(slot)
                                                        }}
                                                    >
                                                        <span className="block text-xs font-medium" style={{ color: CAL_THEME.text }}>
                                                            {new Date(slot.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                                        </span>
                                                        <span className="line-clamp-2 text-[11px]" style={{ color: CAL_THEME.textMuted }}>{slot.reason}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                            {posts.length > 0 && (
                                <span
                                    className="text-[10px] px-1 rounded-sm font-medium"
                                    style={{ background: "rgba(34,211,238,0.10)", color: CAL_THEME.cyan }}
                                >
                                    {posts.length}
                                </span>
                            )}
                            {!isPast && onAddPost && (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        onAddPost(new Date(currentYear, currentMonth, day))
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded cursor-pointer"
                                    style={{ background: "transparent" }}
                                    title="Add post"
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.08)" }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                                >
                                    <Plus className="h-3 w-3" style={{ color: "rgba(255,255,255,0.45)" }} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap content-start gap-1 mt-1">
                        {posts.map((post) => (
                            <DraggablePostBadge key={post.id} post={post} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

export function CalendarView({ posts, workspaceId }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState<Date | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [overId, setOverId] = useState<string | null>(null)
    const [localPosts, setLocalPosts] = useState<CalendarPost[]>(posts)
    const [today, setToday] = useState<Date | null>(null)
    const [recommendedSlots, setRecommendedSlots] = useState<RecommendedSlot[]>([])
    const [isLoadingSlots, setIsLoadingSlots] = useState(false)
    const [slotsError, setSlotsError] = useState<string | null>(null)

    // Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)

    const router = useRouter()
    const { toast } = useToast()

    // Initialize date client-side only to avoid hydration mismatch
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const now = new Date()
            setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
            setToday(now)
        })
        return () => window.cancelAnimationFrame(frame)
    }, [])

    // Sync local state when props change (e.g., after router.refresh())
    useEffect(() => {
        queueMicrotask(() => setLocalPosts(posts))
    }, [posts])

    const visibleRange = useMemo(() => {
        if (!currentDate) return null
        const start = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0, 0))
        const end = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999))
        return { start, end }
    }, [currentDate])

    const slotsByDay = useMemo(() => {
        const map = new Map<string, RecommendedSlot[]>()
        for (const slot of recommendedSlots) {
            const date = new Date(slot.startsAt)
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
            const existing = map.get(key) || []
            existing.push(slot)
            map.set(key, existing.sort((a, b) => b.score - a.score))
        }
        return map
    }, [recommendedSlots])

    useEffect(() => {
        if (!visibleRange) return

        let cancelled = false
        const loadSlots = async () => {
            setIsLoadingSlots(true)
            setSlotsError(null)
            try {
                const params = new URLSearchParams({
                    start: visibleRange.start.toISOString(),
                    end: visibleRange.end.toISOString(),
                    limitPerDay: "2",
                })
                const response = await fetch(`/api/content-intelligence/recommend-slots?${params.toString()}`)
                const data = await response.json().catch(() => ({}))
                if (!response.ok) throw new Error(data?.error || "Failed to load recommended slots")
                if (!cancelled) setRecommendedSlots(Array.isArray(data?.slots) ? data.slots : [])
            } catch (error) {
                if (!cancelled) {
                    setRecommendedSlots([])
                    setSlotsError(error instanceof Error ? error.message : "Failed to load recommended slots")
                }
            } finally {
                if (!cancelled) setIsLoadingSlots(false)
            }
        }

        loadSlots()
        return () => {
            cancelled = true
        }
    }, [visibleRange])

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        })
    )

    // Don't render calendar until client-side date is set
    if (!currentDate || !today) {
        return (
            <Card style={{ background: CAL_THEME.panel, border: `1px solid ${CAL_THEME.border}` }}>
                <CardHeader style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <CardTitle className="font-bold text-xl" style={{ color: CAL_THEME.text }}>Content Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[500px] flex items-center justify-center" style={{ color: CAL_THEME.textMuted }}>
                        Loading calendar...
                    </div>
                </CardContent>
            </Card>
        )
    }

    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth()
    const getSlotsForDay = (day: number | null) => {
        if (!day) return []
        return slotsByDay.get(`${currentYear}-${currentMonth}-${day}`) || []
    }

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

    const monthName = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
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

    const handleDragOver = (event: DragOverEvent) => {
        setOverId(event.over?.id == null ? null : String(event.over.id))
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
        const slotStrength = classifySlotStrength(newDate, recommendedSlots)

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
                description:
                    slotStrength.label === "strong"
                        ? `Moved to a strong recommended window (${slotStrength.score}/100).`
                        : slotStrength.label === "okay"
                            ? `Moved to an okay posting window (${slotStrength.score}/100).`
                            : "Moved outside the strongest recommended windows.",
            })

            // Refresh in background to sync with server
            router.refresh()
        } catch {
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

    const handleAddPost = (date: Date) => {
        setSelectedDate(date)
        setIsCreateModalOpen(true)
    }

    const handleAddRecommendedPost = (slot: RecommendedSlot) => {
        const date = new Date(slot.startsAt)
        if (!Number.isFinite(date.getTime())) return
        setSelectedDate(date)
        setIsCreateModalOpen(true)
    }

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <Card style={{ background: CAL_THEME.panel, border: `1px solid ${CAL_THEME.border}`, boxShadow: "0 14px 34px rgba(0,0,0,0.16)" }}>
                    <CardHeader style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                                <CardTitle className="font-bold text-lg sm:text-xl" style={{ color: CAL_THEME.text }}>Content Calendar</CardTitle>
                                <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: slotsError ? CAL_THEME.coral : CAL_THEME.textMuted }}>
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    <span className="min-w-0">
                                        {slotsError ? "Recommendations unavailable" : isLoadingSlots ? "Loading recommended windows" : "Recommended windows shown by score"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={goToToday}
                                    className="text-xs"
                                    style={{
                                        background: "rgba(255,255,255,0.03)",
                                        borderColor: "rgba(255,255,255,0.08)",
                                        color: "rgba(255,255,255,0.78)",
                                    }}
                                >
                                    Today
                                </Button>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={goToPreviousMonth}
                                        style={{ color: "rgba(255,255,255,0.7)" }}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="min-w-[140px] text-center text-sm font-medium" style={{ color: CAL_THEME.text }}>
                                        {monthName}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={goToNextMonth}
                                        style={{ color: "rgba(255,255,255,0.7)" }}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="grid grid-cols-7 gap-px rounded-lg overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                            {[
                                { full: "Sun", short: "S" },
                                { full: "Mon", short: "M" },
                                { full: "Tue", short: "T" },
                                { full: "Wed", short: "W" },
                                { full: "Thu", short: "T" },
                                { full: "Fri", short: "F" },
                                { full: "Sat", short: "S" },
                            ].map(({ full, short }) => (
                                <div
                                    key={full}
                                    className="p-1 sm:p-2 text-center text-xs font-semibold"
                                    style={{ background: CAL_THEME.panelAlt, color: "rgba(255,255,255,0.42)" }}
                                >
                                    <span className="hidden sm:inline">{full}</span>
                                    <span className="sm:hidden">{short}</span>
                                </div>
                            ))}
                            {gridCells.map((cell, i) => (
                                <DroppableCalendarCell
                                    key={i}
                                    day={cell.day}
                                    cellIndex={i}
                                    isCurrentMonth={cell.isCurrentMonth}
                                    isToday={cell.day ? isToday(cell.day) : false}
                                    isPast={cell.isPast || false}
                                    posts={cell.posts}
                                    currentYear={currentYear}
                                    currentMonth={currentMonth}
                                    isOver={overId === (cell.day ? `cell-${currentYear}-${currentMonth}-${cell.day}` : '')}
                                    onAddPost={handleAddPost}
                                    recommendedSlots={getSlotsForDay(cell.day)}
                                    onAddRecommendedPost={handleAddRecommendedPost}
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

            <CreatePostModal
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
                workspaceId={workspaceId}
                initialDate={selectedDate}
            />
        </>
    )
}
