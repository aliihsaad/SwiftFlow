import { generateContentIdeas } from "@/lib/gemini"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const { topic, platform } = await request.json()

    if (!topic || !platform) {
        return NextResponse.json({ error: "Missing topic or platform" }, { status: 400 })
    }

    const ideas = await generateContentIdeas(topic, platform)

    return NextResponse.json({ ideas })
}
