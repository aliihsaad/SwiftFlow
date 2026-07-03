// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Deno runtime
/**
 * Process AI publishing automations.
 *
 * This is called by scheduler-tick and creates reviewable draft posts from active
 * publishing_automations. Generated-image automations delegate image creation to
 * generate-image with attach context, so the image function owns the media_urls
 * update even if the scheduler caller times out.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import {
  claimDuePublishingAutomations,
  releasePublishingAutomationClaim,
} from "./claim-locking.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error"
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function automationFromRow(row: JsonRecord): JsonRecord {
  const workflowConfig = asRecord(row.workflow_config)
  const consistencyConfig = asRecord(row.consistency_config)

  return {
    name: typeof row.name === "string" ? row.name : "AI publishing automation",
    platforms: asStringArray(row.platforms),
    approval_mode: row.approval_mode === "auto_schedule" || row.approval_mode === "auto_publish"
      ? row.approval_mode
      : "draft_only",
    content_goal: typeof row.content_goal === "string" ? row.content_goal : "",
    brand_voice: typeof row.brand_voice === "string" ? row.brand_voice : "",
    content_pillars: asStringArray(row.content_pillars),
    excluded_terms: asStringArray(row.excluded_terms),
    cta_config: asRecord(row.cta_config),
    media_policy: asRecord(row.media_policy),
    consistency_config: consistencyConfig,
    workflow_config: {
      media_mode: workflowConfig.media_mode === "none" ? "none" : "generated_image",
      ...workflowConfig,
    },
    schedule_config: asRecord(row.schedule_config),
    daily_cap: typeof row.daily_cap === "number" && row.daily_cap > 0 ? row.daily_cap : 1,
  }
}

function summarizeRecentPosts(posts: JsonRecord[]): string {
  if (posts.length === 0) return "No recent app-owned posts found."
  return posts.map((post, index) => {
    const content = String(post.content || "").replace(/\s+/g, " ").slice(0, 220)
    const platforms = Array.isArray(post.platforms) ? post.platforms.join(", ") : "unknown"
    return `${index + 1}. [${post.status || "unknown"} on ${platforms}] ${content || "(media-only post)"}`
  }).join("\n")
}

function summarizeBrandProfile(profile: JsonRecord | null): string {
  if (!profile) return "No workspace brand profile found. Use the automation settings only."
  const brandColors = asRecord(profile.brand_colors)
  const colors = brandColors.enabled
    ? [brandColors.primary, brandColors.secondary, brandColors.accent].filter(Boolean).join(", ")
    : ""

  return [
    profile.business_name ? `Business: ${profile.business_name}` : "",
    profile.industry ? `Industry: ${profile.industry}` : "",
    profile.business_description ? `Description: ${profile.business_description}` : "",
    profile.target_audience ? `Target audience: ${profile.target_audience}` : "",
    profile.brand_voice ? `Brand voice: ${profile.brand_voice}` : "",
    asStringArray(profile.unique_selling_points).length ? `Unique selling points: ${asStringArray(profile.unique_selling_points).join(", ")}` : "",
    asStringArray(profile.content_themes).length ? `Content themes: ${asStringArray(profile.content_themes).join(", ")}` : "",
    colors ? `Brand colors: ${colors}` : "",
  ].filter(Boolean).join("\n") || "Workspace brand profile is mostly empty."
}

function imageModelRecommendation(settings: JsonRecord | null) {
  const provider = typeof settings?.ai_provider === "string" && settings.ai_provider ? settings.ai_provider : "openrouter"
  const configuredModel = typeof settings?.ai_image_model_name === "string" && settings.ai_image_model_name.trim()
    ? settings.ai_image_model_name.trim()
    : null
  const effectiveModel = configuredModel || (provider === "google" ? "gemini-2.5-flash-image-preview" : "google/gemini-2.5-flash-image-preview")
  const typographySafeModels = [
    "google/gemini-2.5-flash-image-preview",
    "gemini-2.5-flash-image-preview",
    "openai/gpt-image-1",
    "gpt-image-1",
  ]
  const isRecommendedForText = typographySafeModels.includes(effectiveModel)

  return {
    provider,
    configuredModel,
    effectiveModel,
    effectiveModelLabel: effectiveModel,
    isRecommendedForText,
    textRenderingPolicy: isRecommendedForText ? "exact_short_text_allowed" : "caption_text_only",
  }
}

function buildIdeaPrompt(automation: JsonRecord, recentPosts: JsonRecord[], brandProfile: JsonRecord | null): string {
  const consistency = asRecord(automation.consistency_config)
  return `Create one social media post idea for this automation.

Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

Goal: ${automation.content_goal}
Platforms: ${asStringArray(automation.platforms).join(", ")}
Content pillars: ${asStringArray(automation.content_pillars).join(", ") || "Use workspace brand profile."}
Excluded terms/claims: ${asStringArray(automation.excluded_terms).join(", ") || "None provided."}
Brand voice override: ${automation.brand_voice || consistency.brand_voice_override || "Use workspace brand profile."}
Visual style: ${consistency.visual_style_prompt || "Use workspace brand profile and keep visuals consistent."}

Recent app-owned posts to avoid repeating:
${summarizeRecentPosts(recentPosts)}

Return one strong idea with a usable caption draft. Avoid repeating recent hooks, topics, and caption structure.`
}

function buildCaptionDescription(automation: JsonRecord, ideaTitle: string, ideaBody: string, recentPosts: JsonRecord[], brandProfile: JsonRecord | null): string {
  const consistency = asRecord(automation.consistency_config)
  const cta = asRecord(automation.cta_config)
  return `Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

Automation goal: ${automation.content_goal}
Idea title: ${ideaTitle}
Idea draft: ${ideaBody}
Platforms: ${asStringArray(automation.platforms).join(", ")}
Brand voice: ${automation.brand_voice || consistency.brand_voice_override || "Use workspace brand profile."}
CTA: ${cta.enabled ? `${cta.text || "Use a clear CTA"} ${cta.url || ""}` : "No forced CTA."}
Avoid these terms: ${asStringArray(automation.excluded_terms).join(", ") || "None."}
Recent posts to avoid duplicating:
${summarizeRecentPosts(recentPosts)}

Write one ready-to-review caption that is consistent with the brand voice and does not repeat recent posts.`
}

function buildImagePrompt(automation: JsonRecord, caption: string, brandProfile: JsonRecord | null, imageModel: JsonRecord): string {
  const consistency = asRecord(automation.consistency_config)
  const palette = asStringArray(consistency.color_palette).join(", ") || "workspace brand colors"
  const visualStyle = consistency.visual_style_prompt || "Build a consistent branded social poster system."
  const typography = consistency.typography_notes || "Use expressive editorial typography: a high-contrast serif-style quote face paired with a clean geometric sans-style attribution and CTA. Avoid generic Arial/Roboto-looking text."
  const textPolicy = imageModel.isRecommendedForText
    ? "- Text rendering is allowed only for one short exact quote phrase or attribution. Do not add extra words, CTA text, hashtags, or invented brand slogans. If unsure, use no text."
    : `- The current image model (${imageModel.effectiveModelLabel}) is not recommended for typography-heavy quote images. Do not render body copy, captions, hashtags, CTA text, or full quote text inside the image. Keep the exact text in the post caption only.`

  return `Create a social media image for this caption:
${caption}

Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

NON-NEGOTIABLE VISUAL DIRECTION:
- Create a designed brand poster, not a stock-photo scene.
- Do not use random laptops, tablets, desks, flowers, generic offices, or unrelated backgrounds unless the brand profile explicitly asks for them.
- Use one repeatable visual system across runs: same composition logic, same type hierarchy, same background language, same motif family.
- Background must be a custom designed backdrop: abstract gradient, paper grain, subtle geometric pattern, soft light field, or branded shape system.
- The post should feel creative and intentional, not a generic quote generator.
${textPolicy}

BRAND VISUAL SYSTEM:
${visualStyle}

COLORS:
Use ${palette}. Keep contrast high and avoid muddy beige/gray photo overlays.

TYPOGRAPHY:
${typography}
For this run: ${imageModel.textRenderingPolicy === "caption_text_only" ? "use typography as a visual inspiration only; do not render readable post text in the image." : "render any visible words with exact spelling, large size, and no extra generated copy."}

LAYOUT:
- 1:1 square social image.
- Strong focal typography or abstract hero mark.
- Leave safe margins.
- Use a consistent signature detail such as a small accent line, corner mark, halo shape, or quote badge.
- Avoid visual repetition while keeping the same brand identity.`
}

function extractIdea(response: JsonRecord, fallback: string): { title: string; body: string } {
  const result = isRecord(response.result) ? response.result : {}
  const rows = Array.isArray(result.data) ? result.data : []
  const first = rows.find(isRecord)
  if (first) {
    return {
      title: typeof first.title === "string" ? first.title : fallback,
      body: typeof first.body === "string" ? first.body : fallback,
    }
  }
  if (typeof result.message === "string") return { title: fallback, body: result.message }
  return { title: fallback, body: fallback }
}

function extractCaption(response: JsonRecord, fallback: string): string {
  const suggestions = Array.isArray(response.suggestions) ? response.suggestions : []
  const first = suggestions.find((entry) => typeof entry === "string" && entry.trim().length > 0)
  return first?.trim() || fallback
}

function nextRunAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

async function hasRecentRunningRun(supabase: ReturnType<typeof createClient>, automationId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("publishing_automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("publishing_automation_id", automationId)
    .eq("status", "running")
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())

  if (error) throw error
  return (count || 0) > 0
}

async function dailyCapReached(supabase: ReturnType<typeof createClient>, automationId: string, dailyCap: number): Promise<boolean> {
  const { count, error } = await supabase
    .from("publishing_automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("publishing_automation_id", automationId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if (error) throw error
  return (count || 0) >= dailyCap
}

async function processAutomation(supabase: ReturnType<typeof createClient>, row: JsonRecord, claimToken: string) {
  const automationId = String(row.id || "")
  const workspaceId = String(row.workspace_id || "")
  const automation = automationFromRow(row)

  if (!automationId) return { automationId, ok: false, error: "Invalid automation row" }

  let runId = ""
  // Set once the claim has been released with the advanced next_run_at, so the
  // failure path knows the row is no longer held by this invocation.
  let claimReleased = false
  try {
    if (!workspaceId) throw new Error("Invalid automation row")

    if (await hasRecentRunningRun(supabase, automationId)) {
      const releaseError = await releasePublishingAutomationClaim(supabase, automationId, claimToken)
      if (releaseError) return { automationId, ok: false, error: releaseError }
      return { automationId, ok: true, skipped: "already_running" }
    }
    if (await dailyCapReached(supabase, automationId, Number(automation.daily_cap) || 1)) {
      const releaseError = await releasePublishingAutomationClaim(supabase, automationId, claimToken)
      if (releaseError) return { automationId, ok: false, error: releaseError }
      return { automationId, ok: true, skipped: "daily_cap_reached" }
    }

    const recentLimit = Number(asRecord(automation.consistency_config).recent_posts_limit) || 12
    const { data: recentRows, error: recentError } = await supabase
      .from("posts")
      .select("content, platforms, status, created_at, published_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(recentLimit)
    if (recentError) throw recentError

    const { data: brandProfile, error: brandProfileError } = await supabase
      .from("workspace_brand_profiles")
      .select("business_name, industry, business_description, target_audience, brand_voice, unique_selling_points, content_themes, brand_colors")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (brandProfileError) throw brandProfileError

    const { data: workspaceSettings, error: workspaceSettingsError } = await supabase
      .from("workspace_settings")
      .select("ai_provider, ai_image_model_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (workspaceSettingsError) throw workspaceSettingsError

    const recentPosts = (recentRows || []) as JsonRecord[]
    const imageModel = imageModelRecommendation((workspaceSettings || null) as JsonRecord | null)

    const { data: run, error: runError } = await supabase
      .from("publishing_automation_runs")
      .insert({
        workspace_id: workspaceId,
        publishing_automation_id: automationId,
        status: "running",
        approval_mode: automation.approval_mode,
        prompt_snapshot: {
          automation_id: automationId,
          workflow_config: automation.workflow_config,
          consistency_config: automation.consistency_config,
          platforms: automation.platforms,
          brand_profile: brandProfile || null,
          image_model_recommendation: imageModel,
          recent_posts: recentPosts,
          trigger: "scheduled_runner",
        },
      })
      .select("id")
      .single()
    if (runError) throw runError
    runId = String(run?.id || "")
    if (!runId) throw new Error("Failed to create publishing automation run")

    const ideaResponse = await invokeEdgeFunction("generate-ideas", {
      workspaceId,
      messages: [{ role: "user", content: buildIdeaPrompt(automation, recentPosts, brandProfile || null) }],
    })
    if (!ideaResponse.ok) throw new Error(ideaResponse.error || "generate-ideas failed")
    const idea = extractIdea(asRecord(ideaResponse.data), String(automation.content_goal || ""))

    const captionResponse = await invokeEdgeFunction("generate-caption", {
      workspaceId,
      description: buildCaptionDescription(automation, idea.title, idea.body, recentPosts, brandProfile || null),
      platforms: automation.platforms,
      tone: "professional",
    })
    if (!captionResponse.ok) throw new Error(captionResponse.error || "generate-caption failed")
    const caption = extractCaption(asRecord(captionResponse.data), idea.body)

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        workspace_id: workspaceId,
        content: caption,
        media_urls: [],
        platforms: automation.platforms,
        status: "draft",
        scheduled_for: null,
        published_at: null,
        last_publish_error_code: null,
        last_publish_error_message: null,
        last_publish_attempted_at: null,
        last_publish_results: [],
        source_publishing_automation_id: automationId,
        source_publishing_automation_run_id: runId,
      })
      .select("id")
      .single()
    if (postError) throw postError

    const postId = String(post?.id || "")
    if (!postId) throw new Error("Failed to create draft post")

    const { error: runUpdateError } = await supabase
      .from("publishing_automation_runs")
      .update({
        generated_post_id: postId,
        result_snapshot: {
          idea,
          caption,
          media_urls: [],
          post_id: postId,
          draft_created_at: new Date().toISOString(),
        },
      })
      .eq("id", runId)
    if (runUpdateError) throw runUpdateError

    // Finalize the claim before delegating image generation, keeping the
    // previous ordering: next_run_at is advanced even if the caller times out
    // while generate-image runs. The token guard makes this a no-op if the
    // lease went stale and another invocation re-claimed the row.
    const releaseError = await releasePublishingAutomationClaim(supabase, automationId, claimToken, {
      last_run_at: new Date().toISOString(),
      last_error: null,
      next_run_at: nextRunAt(),
    })
    if (releaseError) throw new Error(releaseError)
    claimReleased = true

    if (asRecord(automation.workflow_config).media_mode === "generated_image") {
      const imageResponse = await invokeEdgeFunction("generate-image", {
        workspaceId,
        attachToPostId: postId,
        automationRunId: runId,
        automationId,
        messages: [{ role: "user", content: buildImagePrompt(automation, caption, brandProfile || null, imageModel) }],
      })
      if (!imageResponse.ok) throw new Error(imageResponse.error || "generate-image failed")
    } else {
      const { error: completeError } = await supabase
        .from("publishing_automation_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
      if (completeError) throw completeError
    }

    return { automationId, ok: true, postId, runId }
  } catch (error) {
    const message = errorMessage(error)
    if (runId) {
      await supabase
        .from("publishing_automation_runs")
        .update({
          status: "failed",
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }

    if (claimReleased) {
      // The claim was already finalized (next_run_at advanced); only record
      // the late failure, e.g. from generate-image.
      await supabase
        .from("publishing_automations")
        .update({
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", automationId)
    } else {
      await releasePublishingAutomationClaim(supabase, automationId, claimToken, {
        last_error: message,
        next_run_at: nextRunAt(),
      })
    }

    return { automationId, ok: false, runId: runId || undefined, error: message }
  }
}

async function processPublishingAutomations(limit = 1) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing")

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  // Atomically claim due rows with a per-invocation token so overlapping
  // scheduler ticks cannot pick up and fire the same automation twice.
  const claimToken = crypto.randomUUID()
  const rows = await claimDuePublishingAutomations(supabase, claimToken, limit)

  const results = []
  for (const row of rows) {
    results.push(await processAutomation(supabase, row, claimToken))
  }
  return results
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const unauthorized = await assertInternalInvoke(req, corsHeaders)
  if (unauthorized) return unauthorized

  try {
    const startedAt = Date.now()
    const requestBody = req.method === "GET" ? {} : await req.json().catch(() => ({}))
    const requestedLimit = Number(requestBody?.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 3) : 1
    const results = await processPublishingAutomations(limit)
    const success = results.every((result) => result.ok)

    return new Response(JSON.stringify({
      success,
      durationMs: Date.now() - startedAt,
      results,
    }), {
      status: success ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[process-publishing-automations] Fatal error:", error)
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
