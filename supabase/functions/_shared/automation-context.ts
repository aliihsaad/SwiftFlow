// @ts-nocheck - Shared Deno runtime helpers

export const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

export interface TriggerContext {
  comment_id?: string
  post_id?: string
  commenter_id?: string
  commenter_username?: string
  comment_text?: string
  message_id?: string
  sender_id?: string
  sender_username?: string
  message_text?: string
  follower_id?: string
  follower_username?: string
  timestamp?: string
  ai_response?: string
  ai_cta_mode?: 'button' | 'text'
  ai_cta_button_text?: string
  ai_cta_link_url?: string
  ai_cta_link_message?: string
}

export function interpolateTemplate(template: string, ctx: TriggerContext): string {
  const username = ctx.commenter_username || ctx.sender_username || ctx.follower_username || '';
  return (template || '')
    .replace(/\{\{comment_text\}\}/g, ctx.comment_text || '')
    .replace(/\{\{message_text\}\}/g, ctx.message_text || '')
    .replace(/\{\{username\}\}/g, username)
    .replace(/\{\{ai_response\}\}/g, ctx.ai_response || '');
}

export function getRecipientId(ctx: TriggerContext): string | undefined {
  return ctx.commenter_id || ctx.sender_id || ctx.follower_id;
}

export function keywordMatch(text: string, keywords: string[], mode: 'any' | 'keywords'): boolean {
  if (mode === 'any') return true;
  if (!keywords?.length) return false;
  const lowered = (text || '').toLowerCase();
  return keywords.some((k) => lowered.includes(String(k || '').toLowerCase()));
}

function buildDefaultAiTask(ctx: TriggerContext): string {
  if (ctx.comment_text) {
    return `Write one friendly reply to this Instagram comment: "${ctx.comment_text}"`;
  }
  if (ctx.message_text) {
    return `Write one helpful DM reply to this message: "${ctx.message_text}"`;
  }
  if (ctx.follower_username || ctx.follower_id) {
    return `Write one short welcome message for a new follower.`;
  }
  return `Write one short friendly social media reply.`;
}

function getLengthInstruction(length: string | undefined): string {
  switch (String(length || 'short')) {
    case 'long':
      return 'Keep it detailed but concise (up to ~600 characters).';
    case 'medium':
      return 'Keep it concise (around 1-2 short sentences, up to ~320 characters).';
    case 'short':
    default:
      return 'Keep it very concise (ideally one short sentence, under ~220 characters).';
  }
}

function getEmojiInstruction(level: string | undefined): string {
  switch (String(level || 'light')) {
    case 'none':
      return 'Do not use emojis.';
    case 'high':
      return 'You may use emojis freely when natural.';
    case 'medium':
      return 'Use a few emojis when natural.';
    case 'light':
    default:
      return 'Use at most one emoji if it fits.';
  }
}

function getGoalTask(goal: string | undefined, ctx: TriggerContext): string {
  switch (String(goal || 'auto')) {
    case 'reply_comment':
      return `Write one public reply to this comment: "${ctx.comment_text || ''}"`;
    case 'send_dm':
      return `Write one direct message reply for this user message: "${ctx.message_text || ctx.comment_text || ''}"`;
    case 'welcome_new_follower':
      return 'Write one short welcome message for a new follower.';
    case 'support_answer':
      return `Write one helpful support-style answer for: "${ctx.message_text || ctx.comment_text || ''}"`;
    case 'auto':
    default:
      return buildDefaultAiTask(ctx);
  }
}

export function buildAutomationAiPrompt(config: Record<string, unknown> | undefined, ctx: TriggerContext): string {
  const cfg = config || {};
  const renderedUserPrompt = interpolateTemplate(String(cfg.prompt_template || ''), ctx).trim();
  const task = renderedUserPrompt || getGoalTask(String(cfg.preset_goal || 'auto'), ctx);
  const tone = String(cfg.tone || 'friendly');
  const language = String(cfg.language || 'same_as_user');
  const includeCta = cfg.include_cta === true;
  const ctaMode = String(cfg.cta_mode || 'button');
  const ctaButtonText = String(cfg.cta_button_text || '').trim();
  const ctaLinkUrl = String(cfg.cta_link_url || '').trim();
  const ctaLinkMessage = String(cfg.cta_link_message || '').trim();
  const customInstructions = String(cfg.custom_instructions || '').trim();
  const lengthInstruction = getLengthInstruction(String(cfg.length || 'short'));
  const emojiInstruction = getEmojiInstruction(String(cfg.emoji_level || 'light'));

  const contextLines: string[] = [];
  if (ctx.commenter_username) contextLines.push(`Commenter: ${ctx.commenter_username}`);
  if (ctx.sender_username) contextLines.push(`Sender: ${ctx.sender_username}`);
  if (ctx.comment_text) contextLines.push(`Comment text: ${ctx.comment_text}`);
  if (ctx.message_text) contextLines.push(`Message text: ${ctx.message_text}`);

  const contextBlock = contextLines.length > 0
    ? contextLines.join('\n')
    : 'No additional context provided.';

  return [
    'You are an expert social media community manager.',
    'Return exactly ONE final message.',
    'Do not return multiple options.',
    'No bullet points, no markdown, no headings, no labels.',
    'Return plain text only.',
    `Tone: ${tone}.`,
    language === 'same_as_user'
      ? 'Language: match the user language from context.'
      : `Language: ${language}.`,
    lengthInstruction,
    emojiInstruction,
    includeCta
      ? (
        ctaMode === 'button'
          ? `Include a short CTA that naturally leads to the button action${ctaButtonText ? ` ("${ctaButtonText}")` : ''}${ctaLinkMessage ? ` and context "${ctaLinkMessage}"` : ''}${ctaLinkUrl ? ` for URL ${ctaLinkUrl}` : ''}.`
          : 'Include a short CTA sentence when appropriate.'
      )
      : 'Do not add a CTA unless explicitly requested in the task.',
    customInstructions ? `Additional instructions: ${customInstructions}` : '',
    '',
    'Context:',
    contextBlock,
    '',
    `Task: ${task}`,
    '',
    'Output only the final message text.',
  ].join('\n');
}
