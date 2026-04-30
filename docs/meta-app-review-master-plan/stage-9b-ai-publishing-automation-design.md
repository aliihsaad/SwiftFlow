# Stage 9B: AI Publishing Automation Design

Status: `in_progress`

Last updated: 2026-04-30

## Goal

Build Phase 2 publishing automation using already-approved Meta publishing permissions.

The feature should let a workspace define a content goal, cadence, platforms, approval mode, generation workflow, brand voice rules, design consistency rules, and post-history awareness. AI then uses the existing idea, caption, image, carousel, and scheduling functions to create draft or scheduled posts that move through the existing post editor and scheduled publishing worker.

## Permission Boundary

In scope:

- AI-generated post drafts
- AI-generated scheduled posts
- explicitly enabled auto-scheduling
- guarded auto-publish through the existing scheduled post worker
- Facebook Page and Instagram publishing using already-approved permissions

Approved permissions used:

- `pages_manage_posts`
- `instagram_content_publish`
- `pages_show_list`
- `instagram_basic`

Out of scope until later review stages:

- automations triggered by comments
- automations triggered by messages
- inbox or DM actions
- insight-driven post generation
- comment or moderation actions

These out-of-scope flows require separate comments, messaging, or insights permission readiness and must stay hidden until those product surfaces are stable enough for review.

## Architecture Decision

Stage 9B should not create a parallel publisher.

All generated content must be saved into the existing `posts` table, then published by the existing `process-scheduled-posts` edge function when scheduled or due. This preserves the already-tested live behavior for publish-now, scheduled publishing, `published_posts` linkage, failure recording, and retry visibility.

Recommended shape:

- Add a dedicated publishing automation model instead of overloading the current comment/DM automation model.
- Treat the new feature as an orchestrated workflow over existing functions, not as a replacement for them.
- Store generated output as `posts.status = 'draft'` for manual review mode.
- Store generated output as `posts.status = 'scheduled'` with `scheduled_for` for auto-schedule mode.
- Never call Meta Graph directly from the publishing automation runner.
- Let `process-scheduled-posts` own Meta publishing, status transitions, and failure details.

Rationale:

- The current `automations` table requires `social_account_id`, `platform_post_id`, `trigger_config`, and `dm_config`, which are comment/DM workflow concepts.
- The current graph node catalog has schedule and AI-response nodes, but its execution context is designed around engagement events, delayed replies, DMs, comments, and worker actions.
- A dedicated publishing automation slice keeps approved publishing automation separate from future comment/message automation review work.

## MVP Flow

1. User opens Automation and chooses `AI Publishing Automation`.
2. User selects platforms: Facebook, Instagram, or both.
3. User defines the workflow: idea generation, caption generation, image generation, carousel generation, or a simpler caption-only/text-only path.
4. User defines topic, brand voice, design consistency rules, content pillars, exclusions, CTA preference, post-history awareness, and media requirement.
5. User selects cadence, timezone, posting window, and daily cap.
6. User selects approval mode:
   - `manual_review`: create drafts only
   - `auto_schedule`: create scheduled posts
   - `auto_publish`: later gated mode, still implemented as scheduled posts due through `process-scheduled-posts`
7. Runner executes the selected workflow and writes a post row.
8. Existing scheduled posts UI shows draft, scheduled, published, or failed state.

## Existing Function Orchestration

Stage 9B should reuse these existing functions and code paths:

- `generate-ideas`: produce candidate post ideas and captions using workspace brand context.
- `generate-caption`: refine or create platform-aware captions.
- `generate-image`: create a public image asset for media-required workflows.
- `generate-carousel`: create carousel structure and slide image prompts.
- `/api/posts`: create draft, scheduled, or publish-now post rows.
- `process-scheduled-posts`: publish due scheduled rows to Meta and record publish results.

The workflow builder should let the user choose which steps run automatically:

- `ideas_only`: generate ideas and save them for review, without creating scheduled posts.
- `caption_only`: generate a caption and create a draft or Facebook text post.
- `image_post`: generate an idea, caption, and one image, then create a draft or scheduled post.
- `carousel_post`: generate carousel content and images, then create a draft or scheduled carousel-style post when the publishing path supports the media set.
- `manual_media`: generate idea/caption only, but require the user to attach media before Instagram scheduling.

Recommended workflow config fields:

- `idea_mode`: `generate_new`, `fixed_topic`, or `reuse_content_pillars`
- `caption_mode`: `generate`, `refine`, or `use_template`
- `media_mode`: `none`, `generated_image`, `carousel`, or `manual_required`
- `platform_mode`: `facebook_only`, `instagram_only`, or `facebook_and_instagram`
- `caption_strategy`: `same_caption` or `platform_specific`
- `approval_mode`: `manual_review`, `auto_schedule`, or `auto_publish`
- `schedule_mode`: `next_available_slot`, `fixed_weekly_slots`, or `manual_run_only`

Recommended consistency config fields:

- `brand_voice_source`: `workspace_profile`, `custom_override`, or `hybrid`
- `brand_voice_override`: optional custom voice instructions
- `visual_style_prompt`: repeatable image/design direction applied to generated images and carousel slides
- `design_reference_asset_ids`: optional generated or uploaded assets to use as visual references
- `color_palette`: optional brand colors if not already present in the workspace brand profile
- `typography_notes`: optional wording for text-overlay style and layout
- `history_window_days`: how far back to inspect workspace posts
- `recent_posts_limit`: maximum prior posts to include in the prompt context
- `avoid_repeated_topics`: prevent repeating recent topics/hooks
- `avoid_repeated_captions`: prevent near-duplicate captions
- `prefer_successful_patterns`: later uses app-owned history and, when approved, analytics signals

Execution order:

1. Resolve workspace, brand profile, AI settings, and selected platforms.
2. Load prompt context from the workspace brand profile, consistency config, generated/uploaded reference assets, and recent app-owned posts.
3. Generate or select the content idea.
4. Generate/refine caption for selected platforms using brand voice and recent-post anti-repetition rules.
5. Generate image or carousel assets using the visual style prompt and reference assets when configured.
6. Validate platform rules, especially Instagram media requirements.
7. Create a `posts` row through the same payload shape used by the create-post modal.
8. Record the run result with the generated idea, caption, media URLs, post ID, prompt context snapshot, and skipped/failure reason.

## Prompt Context And History Awareness

Automation prompts must be consistent across runs. They should not behave like unrelated one-off assistant chats.

Prompt context should include:

- workspace brand profile: business name, industry, audience, language, brand voice, unique selling points, content themes, and brand colors
- automation-specific voice rules: custom tone, CTA policy, excluded claims, and banned terms
- automation-specific visual rules: style prompt, colors, recurring layout rules, logo/reference asset hints, and carousel design notes
- recent app-owned post history from `posts`: content, platforms, media presence, scheduled/published time, status, and source automation when available
- recent run history from `publishing_automation_runs`: generated ideas, selected captions, media prompts, skipped reasons, and failures

History awareness rules:

- Do not repeat the same hook, caption structure, or topic too frequently.
- Avoid generating visually identical image prompts unless the user requested a series.
- Prefer continuity when the workflow is configured as a campaign or content series.
- Use only app-owned post history for MVP. Do not depend on native Page/Instagram history or insights for Stage 9B because those belong to later permission tracks.
- Store a compact prompt snapshot on every run so future debugging can explain why a post was generated.

Recommended prompt assembly order:

1. system role: social media strategist for the selected platform set
2. brand profile and language requirements
3. automation goal and content pillars
4. design consistency rules
5. recent post summary and anti-repetition constraints
6. workflow step instruction, such as idea, caption, image prompt, or carousel
7. strict JSON output schema for the next step

## Data Model Recommendation

Add new tables instead of reusing `automations` for the first release.

Suggested table: `publishing_automations`

- `id uuid primary key`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `name text not null`
- `is_active boolean default false`
- `platforms jsonb not null default '[]'`
- `approval_mode text not null check in ('manual_review', 'auto_schedule', 'auto_publish')`
- `content_goal text not null`
- `brand_voice text`
- `content_pillars jsonb not null default '[]'`
- `excluded_terms jsonb not null default '[]'`
- `cta_config jsonb not null default '{}'`
- `media_policy jsonb not null default '{}'`
- `workflow_config jsonb not null default '{}'`
- `consistency_config jsonb not null default '{}'`
- `schedule_config jsonb not null`
- `daily_cap integer not null default 1`
- `next_run_at timestamptz`
- `last_run_at timestamptz`
- `last_error text`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Suggested table: `publishing_automation_runs`

- `id uuid primary key`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `publishing_automation_id uuid not null references publishing_automations(id) on delete cascade`
- `status text not null check in ('queued', 'running', 'completed', 'failed', 'skipped')`
- `generated_post_id uuid references posts(id) on delete set null`
- `approval_mode text not null`
- `scheduled_for timestamptz`
- `prompt_snapshot jsonb not null default '{}'`
- `result_snapshot jsonb not null default '{}'`
- `error_message text`
- `created_at timestamptz default now()`
- `finished_at timestamptz`

Optional later improvement:

- add `source_publishing_automation_id` and `source_publishing_automation_run_id` columns to `posts` for clean traceability.

## API Surface

Recommended routes:

- `GET /api/publishing-automations`
- `POST /api/publishing-automations`
- `GET /api/publishing-automations/[id]`
- `PUT /api/publishing-automations/[id]`
- `DELETE /api/publishing-automations/[id]`
- `POST /api/publishing-automations/[id]/toggle`
- `POST /api/publishing-automations/[id]/run-now`
- `GET /api/publishing-automations/[id]/runs`

API rules:

- Require workspace membership and `content:write` for create/update/toggle/run-now.
- Require `content:read` for list/detail/runs.
- Validate platform readiness before enabling or running.
- Validate the requested workflow steps before enabling or running.
- Reject Instagram auto-schedule or auto-publish if no media can be attached.
- Cap generated posts per automation per day.
- Store failed generation attempts in `publishing_automation_runs`.

## Runner

Add a new edge function: `process-publishing-automations`.

Responsibilities:

- claim due active publishing automations
- enforce daily cap and posting window
- orchestrate the existing idea, caption, image, and carousel generation functions
- create a draft or scheduled `posts` row
- create/update a `publishing_automation_runs` row
- compute `next_run_at`
- never publish directly to Meta

Add it to `scheduler-tick` only after the runner is stable:

- `process-scheduled-posts`
- `process-scheduled-executions`
- `process-publishing-automations`

## Media Policy

Instagram needs media for publishing. Facebook can publish text-only posts.

MVP policy:

- Manual review mode can create text-only drafts for any selected platform.
- Auto-schedule for Instagram requires at least one media source.
- Auto-publish for Instagram requires verified public media URLs.
- Generated images should be uploaded to existing public storage before post rows are scheduled.
- If media generation fails, create a failed run and do not create a broken scheduled post.

Pragmatic release order:

- ship `manual_review` first
- then `auto_schedule` for Facebook text and media posts
- then `auto_schedule` for Instagram only after image generation/upload is deterministic
- hold `auto_publish` behind explicit workspace/account opt-in

## UI Placement

Keep publishing automation visibly separate from engagement automation.

Recommended UI:

- Add an Automation page section or tab named `Publishing Automations`.
- Keep current comment/DM templates under `Engagement Automations`.
- Show a permission-safe badge: `Uses approved publishing permissions`.
- Show disabled messaging for comment/message automations until those permission tracks are ready.

Wizard steps:

- Goal
- Platforms
- Cadence
- Content Rules
- Approval Mode
- Review

## Safety Controls

Required before enabling auto-schedule:

- workspace opt-in
- automation pause/resume
- per-automation daily cap
- per-workspace daily cap
- posting window and timezone
- duplicate-caption guard
- connected-account capability check at run time
- clear failed-run history
- generated-post traceability

Required before enabling auto-publish:

- explicit confirmation copy that posts can go live automatically
- short preview window or dry-run history
- platform-specific capability check
- emergency pause control
- failed publish visibility in existing scheduled/failed posts UI

## Implementation Slices

### 9B.1 Design And Schema

- Add this design doc.
- Add Supabase migration for `publishing_automations` and `publishing_automation_runs`.
- Add TypeScript types for publishing automation config and runs.

Status: implemented locally and migration applied to remote Supabase on 2026-04-30.

### 9B.2 Draft-Only Automation

- Add API CRUD routes.
- Add a simple UI wizard.
- Add `run-now` that generates one draft `posts` row.
- Reuse existing assistant/AI generation patterns where practical.

Status: API foundation implemented locally. UI wizard is still pending.

Current UI status:

- Initial Automation dashboard panel is implemented for draft-only publishing automations.
- Users can create a draft-only workflow with Facebook/Instagram platform selection, content goal, brand voice override, and design consistency prompt.
- Users can run draft generation from the panel.
- Edit/delete UI and scheduled runner remain pending.

### 9B.3 Scheduled Automation

- Add `process-publishing-automations`.
- Add `next_run_at` calculation.
- Generate scheduled `posts` rows for future times.
- Keep publishing delegated to `process-scheduled-posts`.

### 9B.4 Guarded Auto-Publish

- Add explicit `auto_publish` enablement.
- Enforce caps, platform readiness, media readiness, and emergency pause.
- Validate failure behavior through mocked/staging cases before using live credentials.

## Test Plan

Static checks:

- targeted ESLint for new TypeScript files
- `npx tsc --noEmit --pretty false`

API checks:

- unauthenticated requests return 401
- non-member workspace access is blocked
- missing content permission is blocked
- invalid platforms, cadence, approval mode, and caps are rejected
- Instagram auto-schedule without media policy is rejected

Runner checks:

- due automation is claimed once
- paused automation is skipped
- daily cap blocks extra runs
- generated draft rows are visible in scheduled/draft UI
- scheduled rows are later published by `process-scheduled-posts`
- AI failure records a failed run without creating broken post rows

Live checks:

- manual-review draft creation
- Facebook auto-scheduled post
- Instagram auto-scheduled post with media
- pause/resume behavior
- failed generation visibility

## Current Decision

Start Stage 9B with a dedicated publishing automation surface and runner, connected to the existing `posts` and `process-scheduled-posts` pipeline.

Do not extend comment/DM graph automation for this MVP. That engine remains valuable later, but it belongs to the comments/messages permission track, not the already-approved publishing automation track.
