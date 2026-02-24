"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Clock, Sparkles } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface SchedulingControlsProps {
    scheduledAt: Date | undefined
    onChange: (date: Date) => void
}

export function SchedulingControls({ scheduledAt, onChange }: SchedulingControlsProps) {
    const [isTimeslotsOpen, setIsTimeslotsOpen] = useState(false)

    const handleNextSlot = async () => {
        try {
            const res = await fetch('/api/recommend-next-slot')
            const data = await res.json()
            if (data.nextSlot) onChange(new Date(data.nextSlot))
        } catch (e) {
            console.error(e)
        }
    }

    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return
        const newDate = new Date(date)
        const current = scheduledAt || new Date()
        newDate.setHours(current.getHours())
        newDate.setMinutes(current.getMinutes())
        onChange(newDate)
    }

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const timeStr = e.target.value
        if (!timeStr) return
        const [hours, minutes] = timeStr.split(':').map(Number)
        const newDate = new Date(scheduledAt || new Date())
        newDate.setHours(hours)
        newDate.setMinutes(minutes)
        onChange(newDate)
    }

    const QUICK_SLOTS = [
        { label: 'Tomorrow 9 AM', h: 9 },
        { label: '1 PM', h: 13 },
        { label: '6 PM', h: 18 },
    ]

    return (
        <div className="w-full space-y-2">
            {/* Row 1 – Quick actions */}
            <div className="flex items-center gap-2 flex-wrap">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextSlot}
                    className="h-8 text-xs gap-1.5 shrink-0"
                >
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    Next slot
                </Button>

                <Popover open={isTimeslotsOpen} onOpenChange={setIsTimeslotsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                            <Clock className="h-3 w-3" />
                            Timeslots
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                        <div className="space-y-0.5">
                            {QUICK_SLOTS.map(({ label, h }, i) => (
                                <button
                                    key={i}
                                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                                    onClick={() => {
                                        const d = new Date()
                                        d.setDate(d.getDate() + 1)
                                        d.setHours(h, 0, 0, 0)
                                        onChange(d)
                                        setIsTimeslotsOpen(false)
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                {scheduledAt && (
                    <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                        {format(scheduledAt, "MMM d 'at' p")}
                    </span>
                )}
            </div>

            {/* Row 2 – Date + Time pickers */}
            <div className="flex gap-2">

                {/* ── Mobile: native date input (no popover, no overflow) ── */}
                <div className="sm:hidden flex-1 min-w-0 flex items-center gap-1.5 border rounded-md px-3 bg-background h-9">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-60" />
                    <input
                        type="date"
                        className="bg-transparent text-sm focus:outline-none flex-1 min-w-0 text-foreground"
                        value={scheduledAt ? format(scheduledAt, 'yyyy-MM-dd') : ''}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => {
                            if (!e.target.value) return
                            const [y, m, d] = e.target.value.split('-').map(Number)
                            const newDate = new Date(scheduledAt || new Date())
                            newDate.setFullYear(y, m - 1, d)
                            onChange(newDate)
                        }}
                    />
                </div>

                {/* ── Desktop: Radix calendar popover ── */}
                <div className="hidden sm:block flex-1 min-w-0">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-9 pl-3 pr-2 text-left font-normal text-sm justify-start",
                                    !scheduledAt && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0 opacity-60" />
                                <span className="truncate">
                                    {scheduledAt ? format(scheduledAt, "MMM d, yyyy") : "Pick date"}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={scheduledAt}
                                onSelect={handleDateSelect}
                                initialFocus
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Time picker */}
                <div className="flex items-center gap-1.5 border rounded-md px-3 bg-background h-9 shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="time"
                        className="bg-transparent text-sm focus:outline-none w-[80px]"
                        value={scheduledAt ? format(scheduledAt, 'HH:mm') : ''}
                        onChange={handleTimeChange}
                    />
                </div>
            </div>

            {/* Mobile-only scheduled summary */}
            {scheduledAt && (
                <p className="text-xs text-muted-foreground sm:hidden">
                    Scheduled for: <span className="font-medium text-foreground">{format(scheduledAt, "MMM d 'at' p")}</span>
                </p>
            )}
        </div>
    )
}
