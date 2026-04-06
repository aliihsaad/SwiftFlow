'use server'

import { generateContentIdeas, chatWithAI } from "@/lib/gemini"
import { cookies } from 'next/headers'

export async function generateIdeasAction(topic: string, platform: string) {
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value

    if (!activeWorkspaceId) {
        throw new Error("No active workspace")
    }

    return await generateContentIdeas(topic, platform, activeWorkspaceId)
}

export async function chatAction(messages: any[]) {
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value

    if (!activeWorkspaceId) {
        throw new Error("No active workspace")
    }

    // Basic wrapper, real app might validate or store in DB
    try {
        const response = await chatWithAI(messages, activeWorkspaceId)
        return response
    } catch (e) {
        console.error("Server Action Error (chatAction):", e)
        throw new Error("Failed to chat with AI")
    }
}
