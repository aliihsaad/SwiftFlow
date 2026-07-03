// @ts-nocheck - Shared Deno runtime helpers

import { META_GRAPH_API_BASE_URL } from "./meta-graph.ts";

export const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

export interface TriggerContext {
  comment_id?: string
  post_id?: string
  /** Caption/message of the commented media (enriched at run time). */
  post_caption?: string
  /** Instagram media_product_type of the commented media (FEED | REELS | ...). */
  media_type?: string
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
  alert_error?: string
  alert_source_node_id?: string
  alert_source_node_type?: string
  alert_source_node_label?: string
  automation_id?: string
  automation_name?: string
  workspace_id?: string
  node_id?: string
  node_type?: string
  node_label?: string
  platform?: string
}

export function interpolateTemplate(template: string, ctx: TriggerContext): string {
  const username = ctx.commenter_username || ctx.sender_username || ctx.follower_username || '';
  const replacements: Record<string, string> = {
    comment_text: ctx.comment_text || '',
    message_text: ctx.message_text || '',
    username,
    ai_response: ctx.ai_response || '',
    alert_error: ctx.alert_error || '',
    alert_source_node_id: ctx.alert_source_node_id || '',
    alert_source_node_type: ctx.alert_source_node_type || '',
    alert_source_node_label: ctx.alert_source_node_label || '',
    post_id: ctx.post_id || '',
    post_caption: ctx.post_caption || '',
    comment_id: ctx.comment_id || '',
    commenter_id: ctx.commenter_id || '',
    message_id: ctx.message_id || '',
    sender_id: ctx.sender_id || '',
    follower_id: ctx.follower_id || '',
    timestamp: ctx.timestamp || '',
    automation_id: ctx.automation_id || '',
    automation_name: ctx.automation_name || '',
    workspace_id: ctx.workspace_id || '',
    node_id: ctx.node_id || '',
    node_type: ctx.node_type || '',
    node_label: ctx.node_label || '',
    platform: ctx.platform || '',
  };
  return (template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => replacements[key] ?? '');
}

export function getRecipientId(ctx: TriggerContext): string | undefined {
  return ctx.commenter_id || ctx.sender_id || ctx.follower_id;
}

const MAX_ENRICHED_CAPTION_LENGTH = 1000;

/**
 * Ensures comment-trigger runs carry the commented media's caption so AI
 * responses (and {{post_caption}} templates) are grounded in the actual post
 * instead of replying blindly. Needed for broad trigger scopes (any post /
 * any Reel) where no post is pre-selected in the trigger config.
 *
 * Resolution order: the trigger config's stored caption for specific-post
 * automations (no network), then a Meta Graph lookup with the automation's
 * account token. Enrichment is best-effort: failures never block the run.
 */
export async function enrichCommentPostContext(
  triggerContext: TriggerContext,
  automation: any,
  account: { access_token?: string; platform?: string } | null,
): Promise<TriggerContext> {
  const ctx: TriggerContext = { ...triggerContext };
  if (!ctx.post_id || ctx.post_caption) return ctx;

  const triggerNode = automation?.workflow_graph?.nodes?.find(
    (node: any) => String(node?.data?.type || '').startsWith('trigger_'),
  );
  const config = triggerNode?.data?.config || {};
  if (config.post_id && config.post_id === ctx.post_id && config.post_caption) {
    ctx.post_caption = String(config.post_caption).slice(0, MAX_ENRICHED_CAPTION_LENGTH);
    return ctx;
  }

  if (!account?.access_token) return ctx;

  try {
    // IG media exposes caption/media_product_type; FB page posts expose message.
    const fields = account.platform === 'facebook' ? 'message' : 'caption,media_product_type';
    const response = await fetch(
      `${META_GRAPH_URL}/${ctx.post_id}?fields=${fields}&access_token=${account.access_token}`,
    );
    if (!response.ok) return ctx;

    const media = await response.json();
    const caption = typeof media?.caption === 'string' ? media.caption : (typeof media?.message === 'string' ? media.message : '');
    if (caption) ctx.post_caption = caption.slice(0, MAX_ENRICHED_CAPTION_LENGTH);
    if (!ctx.media_type && typeof media?.media_product_type === 'string') {
      ctx.media_type = media.media_product_type;
    }
  } catch (error) {
    console.error('[AUTOMATION] Post context enrichment failed:', error?.message || error);
  }
  return ctx;
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
  if (ctx.post_caption) {
    const isReel = String(ctx.media_type || '').toUpperCase().startsWith('REEL');
    contextLines.push(`The comment is on ${isReel ? 'a Reel' : 'a post'} with caption: "${ctx.post_caption}"`);
  }

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
