import { NextResponse } from 'next/server'
import { addHours, startOfHour, addDays, setHours } from 'date-fns'

export async function GET() {
    // Recommend a few slots: tomorrow morning, tomorrow evening, etc.
    const now = new Date()
    const tomorrow = addDays(now, 1)

    const slots = [
        setHours(tomorrow, 9).toISOString(),  // 9 AM tomorrow
        setHours(tomorrow, 13).toISOString(), // 1 PM tomorrow
        setHours(tomorrow, 18).toISOString(), // 6 PM tomorrow
        addDays(setHours(tomorrow, 9), 1).toISOString(), // 9 AM day after
    ]

    return NextResponse.json({ slots })
}
