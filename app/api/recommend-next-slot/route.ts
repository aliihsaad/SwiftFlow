import { NextResponse } from 'next/server'
import { recommendSlots } from '@/lib/content-intelligence/timing'

export async function GET() {
    const [nextSlot] = recommendSlots({
        platform: 'all',
        now: new Date(),
        signals: {
            brand: null,
            history: {
                totalPublishedPosts: 0,
                topPosts: [],
                hashtagPerformance: [],
                hourlyPerformance: [],
            },
            capabilities: {
                hasMetaInsights: false,
                hasFacebookEngagement: false,
            },
        },
    })

    return NextResponse.json({ nextSlot: nextSlot?.startsAt || new Date().toISOString() })
}
