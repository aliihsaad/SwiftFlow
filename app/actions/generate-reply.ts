'use server'

import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';
import { generateText } from '@/lib/gemini';

interface BrandProfile {
    business_name: string | null;
    business_description: string | null;
    brand_voice: string | null;
    target_audience: string | null;
    industry: string | null;
}

interface GenerateReplyInput {
    comment: string;
    authorUsername: string | null;
    postContent: string | null;
    platform: string;
}

export async function generateCommentReply(input: GenerateReplyInput): Promise<string> {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('Unauthorized');
    }

    // Get active workspace
    const activeWorkspace = await getActiveWorkspace();
    if (!activeWorkspace) {
        throw new Error('No active workspace found');
    }

    const { comment, authorUsername, postContent, platform } = input;

    if (!comment) {
        throw new Error('comment is required');
    }

    // Fetch brand profile for context
    const { data: brandProfile } = await supabase
        .from('workspace_brand_profiles')
        .select('business_name, business_description, brand_voice, target_audience, industry')
        .eq('workspace_id', activeWorkspace.id)
        .maybeSingle();

    // Build context-aware prompt
    const prompt = buildReplyPrompt({
        comment,
        authorUsername,
        postContent,
        platform,
        brandProfile
    });

    // Generate reply using Gemini
    const reply = await generateText(prompt, activeWorkspace.id);

    // Clean up the reply
    return reply
        .replace(/^["']|["']$/g, '')
        .replace(/^Reply:\s*/i, '')
        .trim();
}

function buildReplyPrompt({
    comment,
    authorUsername,
    postContent,
    platform,
    brandProfile
}: {
    comment: string;
    authorUsername: string | null;
    postContent: string | null;
    platform: string;
    brandProfile: BrandProfile | null;
}): string {
    const parts: string[] = [];

    parts.push('Generate a friendly, engaging reply to this social media comment.');
    parts.push('');

    if (brandProfile) {
        parts.push('=== BRAND CONTEXT ===');
        if (brandProfile.business_name) {
            parts.push(`Business: ${brandProfile.business_name}`);
        }
        if (brandProfile.industry) {
            parts.push(`Industry: ${brandProfile.industry}`);
        }
        if (brandProfile.brand_voice) {
            parts.push(`Brand Voice/Tone: ${brandProfile.brand_voice}`);
        }
        if (brandProfile.business_description) {
            parts.push(`About: ${brandProfile.business_description}`);
        }
        parts.push('');
    }

    parts.push('=== COMMENT DETAILS ===');
    parts.push(`Platform: ${platform}`);
    if (authorUsername) {
        parts.push(`Commenter: @${authorUsername}`);
    }
    parts.push(`Comment: "${comment}"`);

    if (postContent) {
        parts.push('');
        parts.push('=== ORIGINAL POST CONTEXT ===');
        parts.push(postContent);
    }

    parts.push('');
    parts.push('=== INSTRUCTIONS ===');
    parts.push('- Write a personalized reply that matches the brand voice');
    parts.push('- Be warm, authentic, and engaging');
    parts.push('- Keep it concise (1-3 sentences max)');
    parts.push('- Use appropriate emojis sparingly if it fits the tone');
    parts.push('- Address the commenter by name if appropriate');
    parts.push('- If they asked a question, answer it helpfully');
    parts.push('- If they gave positive feedback, thank them genuinely');
    parts.push('- If they expressed concern, acknowledge it empathetically');
    parts.push('- Do NOT use hashtags in replies');
    parts.push('- Do NOT be overly promotional');
    parts.push('');
    parts.push('Reply only with the response text, nothing else:');

    return parts.join('\n');
}
