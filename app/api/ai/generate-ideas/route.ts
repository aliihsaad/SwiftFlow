import { generateContentIdeas } from "@/lib/gemini"
import { NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"

export async function POST(request: Request) {
    const { topic, platform } = await request.json()

    if (!topic || !platform) {
        return NextResponse.json({ error: "Missing topic or platform" }, { status: 400 })
    }

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
        return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
    }

    const ideas = await generateContentIdeas(topic, platform, activeWorkspace.id)

    return NextResponse.json({ ideas })
}
