import { GoogleGenerativeAI } from "@google/generative-ai";
import { getWorkspaceSettings } from "@/app/actions/settings";
import { getDefaultModelForProvider } from "@/lib/ai-models";

function normalizeApiKey(value: string | null | undefined): string {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

/** Known deprecated model names → their replacement. */
const GEMINI_MODEL_UPGRADES: Record<string, string> = {
    "gemini-pro": "gemini-2.0-flash",
    "gemini-1.5-flash-latest": "gemini-1.5-flash",
};

/**
 * Converts raw SDK errors into clean, user-friendly messages.
 */
export function toUserFriendlyAIError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);

    if (/API_KEY_INVALID|api key not valid/i.test(raw)) {
        return "Your Gemini API key is invalid or expired. Please update it in Settings → AI Provider.";
    }
    if (/PERMISSION_DENIED/i.test(raw)) {
        return "Your API key doesn't have permission for this operation. Check your Google Cloud project settings.";
    }
    if (/NOT_FOUND|MODEL_NOT_FOUND/i.test(raw)) {
        return "The selected AI model was not found. Try changing the model in Settings → AI Provider.";
    }
    if (/RESOURCE_EXHAUSTED|quota/i.test(raw)) {
        return "AI API quota exceeded. Wait a moment or upgrade your API plan.";
    }
    if (/SAFETY|blocked|HARM/i.test(raw)) {
        return "Content was blocked by AI safety filters. Try rephrasing your prompt.";
    }

    // Strip SDK prefix and JSON blobs
    return raw
        .replace(/\[GoogleGenerativeAI Error\]:\s*/i, "")
        .replace(/Error fetching from https:\/\/[^\s:]+:\s*/i, "")
        .replace(/\[\{[\s\S]*?\}\]/g, "")
        .trim() || "An unexpected AI error occurred. Please try again.";
}

async function getGeminiModel(workspaceId: string) {
    const settings = await getWorkspaceSettings(workspaceId);

    // Resolve API key: workspace settings → env fallback
    const apiKey = normalizeApiKey(settings?.gemini_api_key) || normalizeApiKey(process.env.GEMINI_API_KEY);
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Add it in Settings → AI Provider.');
    }
    if (!apiKey.startsWith('AIza')) {
        throw new Error('Your Gemini API key looks invalid (should start with "AIza..."). Check Settings → AI Provider.');
    }

    // Resolve model with upgrade for deprecated names
    const defaultModel = getDefaultModelForProvider('gemini');
    let modelName = (settings?.ai_text_model_name || settings?.ai_model_name || defaultModel).trim();
    if (GEMINI_MODEL_UPGRADES[modelName]) {
        modelName = GEMINI_MODEL_UPGRADES[modelName];
    }
    // Cross-provider guard
    if (modelName.startsWith('gpt-')) {
        modelName = defaultModel;
    }

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
        throw new Error(toUserFriendlyAIError(e));
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
        throw new Error(toUserFriendlyAIError(e));
    }
}

export async function generateText(prompt: string, workspaceId: string) {
    try {
        const model = await getGeminiModel(workspaceId);
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("Gemini Error (generateText):", e);
        throw new Error(toUserFriendlyAIError(e));
    }
}
