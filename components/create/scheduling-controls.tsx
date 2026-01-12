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
            if (data.nextSlot) {
                onChange(new Date(data.nextSlot))
            }
        } catch (e) {
            console.error(e)
        }
    }

    // Handle date change from Calendar
    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return
        const newDate = new Date(date)
        const current = scheduledAt || new Date()
        newDate.setHours(current.getHours())
        newDate.setMinutes(current.getMinutes())
        onChange(newDate)
    }

    // Handle time change
    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const timeStr = e.target.value
        if (!timeStr) return
        const [hours, minutes] = timeStr.split(':').map(Number)
        const newDate = new Date(scheduledAt || new Date())
        newDate.setHours(hours)
        newDate.setMinutes(minutes)
        onChange(newDate)
    }

    return (
        <div className="space-y-0 flex items-center gap-2">
            <label className="text-sm font-medium">Pick a Date & Time:</label>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleNextSlot} className="h-8 text-xs gap-1.5">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    Next slot
                </Button>
                <Popover open={isTimeslotsOpen} onOpenChange={setIsTimeslotsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                            <Clock className="h-3 w-3" />
                            Timeslots
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="end">
                        <div className="space-y-1">
                            {['Tomorrow 9:00 AM', 'Tomorrow 1:00 PM', 'Tomorrow 6:00 PM'].map((slot, i) => (
                                <button
                                    key={i}
                                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent"
                                    onClick={() => {
                                        const d = new Date()
                                        d.setDate(d.getDate() + 1)
                                        d.setHours(i === 0 ? 9 : i === 1 ? 13 : 18)
                                        d.setMinutes(0)
                                        onChange(d)
                                        setIsTimeslotsOpen(false)
                                    }}
                                >
                                    {slot}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="w-px h-6 bg-border mx-1" />

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-[240px] pl-3 text-left font-normal h-8",
                                !scheduledAt && "text-muted-foreground"
                            )}
                        >
                            {scheduledAt ? (
                                format(scheduledAt, "PPP")
                            ) : (
                                <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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

                <div className="flex items-center border rounded-md px-3 bg-background h-8">
                    <Clock className="h-4 w-4 text-muted-foreground mr-2" />
                    <input
                        type="time"
                        className="bg-transparent text-sm focus:outline-none"
                        value={scheduledAt ? format(scheduledAt, 'HH:mm') : ''}
                        onChange={handleTimeChange}
                    />
                </div>
            </div>

            {scheduledAt && (
                <p className="text-xs text-muted-foreground ml-2">
                    Scheduled for: <span className="font-medium text-foreground">{format(scheduledAt, "PPPP 'at' p")}</span>
                </p>
            )}
        </div>
    )
}
