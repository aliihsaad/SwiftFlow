import { NextResponse } from 'next/server'
import { addHours, startOfHour, format } from 'date-fns'

export async function GET() {
    // Simple logic: Recommend next hour start
    // In a real app, this would analyze engagement metrics to find optimal time
    const now = new Date()
    const nextSlot = startOfHour(addHours(now, 1)).toISOString()

    return NextResponse.json({ nextSlot })
}
