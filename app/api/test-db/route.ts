import { NextResponse } from 'next/server'

/**
 * Legacy debug endpoint intentionally disabled.
 * Keeping a stub route avoids stale route-type references until the next clean build.
 */
export async function GET() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
