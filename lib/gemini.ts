import { GoogleGenerativeAI } from "@google/generative-ai";
import { getWorkspaceSettings } from "@/app/actions/settings";

async function getGeminiModel(workspaceId: string) {
    // Fetch settings from database
    const settings = await getWorkspaceSettings(workspaceId);

    // Get API key from settings (fallback to env if not set in DB)
    const apiKey = settings?.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please add it in Settings > AI Provider');
    }

    const modelName = settings?.ai_model_name || 'gemini-1.5-flash';
    const temperature = settings?.ai_temperature || 0.7;
    const maxTokens = settings?.ai_max_tokens || 2048;

    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: "You are an expert Social Media Manager AI Assistant. Your role is to help users create engaging content, plan schedules, and analyze social media strategies for platforms like Instagram, Facebook, LinkedIn, and Twitter.\n\nGuidelines:\n1. Be concise, professional, and creative.\n2. When asked for captions, provide multiple variations (e.g., Short, Funny, Professional).\n3. Suggest relevant hashtags.\n4. If asked about technical issues, guide them to the Settings page.\n5. Do not just list generic capabilities; actively help them with their specific request.\n6. Use emoji where appropriate to match the social media vibe.",
        generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
        }
    });
}

export async function generateContentIdeas(topic: string, platform: string, workspaceId: string) {
    const model = await getGeminiModel(workspaceId);
    const prompt = `Generate 5 engaging ${platform} post ideas about: ${topic}
  
  Requirements:
  - Start with attention-grabbing hooks
  - Include storytelling elements
  - Mix of educational and entertaining content
  - Optimized for ${platform} algorithm
  
  Return JSON: [{title, hook, content_preview, cta, suggested_hashtags}]`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Simple clean up if markdown blocks are returned
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Gemini Error (generateContentIdeas):", e);
        return [];
    }
}

export async function chatWithAI(messages: { role: string, content: string }[], workspaceId: string) {
    try {
        const model = await getGeminiModel(workspaceId);
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'user') throw new Error("Last message must be from user");

        // Actually startChat takes history of *previous* messages.
        // Google Gemini requires the first message in history to be from 'user'.
        // If our local state starts with an 'assistant' greeting, we must filter it out.
        const history = messages.slice(0, -1)
            .filter((m, index) => !(index === 0 && m.role === 'assistant'))
            .map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

        const chatSession = model.startChat({ history });
        const result = await chatSession.sendMessage(lastMsg.content);
        return result.response.text();
    } catch (e) {
        console.error("Gemini Error (chatWithAI):", e);
        throw e; // Rethrow so action catches it
    }
}

export async function generateText(prompt: string, workspaceId: string) {
    try {
        const model = await getGeminiModel(workspaceId);
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("Gemini Error (generateText):", e);
        throw e;
    }
}
