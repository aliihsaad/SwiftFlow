'use server'

import { generateContentIdeas, chatWithAI } from "@/lib/gemini"

export async function generateIdeasAction(topic: string, platform: string) {
    return await generateContentIdeas(topic, platform)
}

export async function chatAction(messages: any[]) {
    // Basic wrapper, real app might validate or store in DB
    try {
        const response = await chatWithAI(messages)
        return response
    } catch (e) {
        console.error("Server Action Error (chatAction):", e)
        throw new Error("Failed to chat with AI")
    }
}
