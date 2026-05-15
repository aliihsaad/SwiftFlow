# AI Assistant Command Center Design

Date: 2026-05-15
Project: Social-Media-Manager-AI-Tool
Status: Approved direction, ready for implementation planning

## Summary

The AI Assistant should move from a generic content chatbot into a Hybrid Command Center for the app. It should help users create content, improve existing work, understand performance, and operate core workspace features without making the interface feel hidden or unpredictable.

The current assistant mixes chat, content generation, image generation, carousel generation, brand-image flows, attachments, scheduling handoff, and chat history inside one large component. Function switching is mostly invisible to the user, backend context is limited, and the experience is harder to reason about on mobile.

The new assistant should be mode-based, context-aware, action-confirmed, and mobile-friendly.

## Product Goals

1. Make the assistant easy to understand before the user types.
2. Keep content creation fast: ideas, captions, images, carousels, and draft handoff.
3. Add app-aware help: posts, scheduled posts, analytics, automations, brand profile, and connected accounts.
4. Prevent accidental writes by confirming destructive or persistent actions.
5. Make mobile a first-class workflow, not a squeezed desktop chat.
6. Keep implementation phased so the assistant can improve without blocking payments or Meta review work.

## Non-Goals

1. Do not build a full autonomous agent that can freely mutate the workspace without confirmation.
2. Do not replace the Developer API or MCP connector work. The assistant may reuse those concepts later.
3. Do not rebuild every content generation Edge Function in the first phase.
4. Do not expose paid-plan gating in this pass. Premium restrictions come later after the feature is reliable.

## Core UX Model

The assistant is organized around visible modes. The user should always know what kind of work the assistant is doing.

Modes:

1. Create
   - Generate ideas, captions, images, carousels, and post drafts.
   - Primary outputs are structured content cards and draft preview cards.

2. Improve
   - Rewrite captions, shorten, expand, add CTA, adjust tone, improve hook, localize language.
   - Primary outputs are before/after cards with quick actions.

3. Analyze
   - Explain analytics, identify top posts, compare periods, recommend times, hashtags, formats, and topics.
   - Primary outputs are insight cards with source labels.

4. Operate
   - Inspect scheduled posts, drafts, automations, brand profile, social accounts, and workspace setup.
   - Write actions require explicit confirmation cards before saving.

5. Ask
   - General assistant chat and product help.
   - Used when no specialized mode fits.

The assistant can auto-detect intent, but the selected mode must remain visible as a chip near the input. Users can switch modes manually.

## Empty State

The empty state should be practical and workflow-first. It should avoid generic marketing text.

Primary quick starts:

1. Create post
2. Improve draft
3. Analyze performance
4. Plan week
5. Manage automations

Each quick start should set the visible mode and either ask one focused follow-up question or open a compact workflow card.

## Layout

### Desktop

Use a quiet operational layout:

1. Left rail
   - Mode switcher
   - New chat
   - Recent sessions
   - Quick workflows

2. Main area
   - Conversation stream
   - Structured result cards
   - Sticky composer

3. Optional right context drawer
   - Current brand profile summary
   - Selected draft/post context
   - Recent analytics snapshot
   - Active automation summary

The right drawer can be hidden by default and opened when useful. It should not block normal chat.

### Mobile

Use a single-column layout:

1. Top bar with assistant name, new chat, and history.
2. Horizontal mode chips below the top bar.
3. Conversation and cards in one scroll surface.
4. Sticky bottom composer.
5. Context drawer opens as a bottom sheet.

Cards must be thumb-friendly and avoid tiny horizontal controls. Long outputs should collapse with a clear expand action.

## Composer

The composer should support:

1. Text input.
2. Image attachment.
3. Visible mode chip.
4. Submit button.
5. Optional context chip when a draft, post, or analytics period is selected.

The current hidden `activeFunction` behavior should be removed or wrapped behind the visible mode/intent system.

## Intent Routing

Every submitted message should be routed through a lightweight intent layer before selecting the backend flow.

Intent categories:

1. `create`
2. `improve`
3. `analyze`
4. `operate`
5. `ask`

The router can start rule-based:

1. Button clicks set the mode directly.
2. Keywords guide ambiguous free text.
3. If confidence is low, ask one clarifying question instead of guessing.

Later, the router can use a model call, but the first version should avoid adding unnecessary latency and cost.

Routing output:

```ts
type AssistantIntent = {
  mode: 'create' | 'improve' | 'analyze' | 'operate' | 'ask'
  action:
    | 'generate_ideas'
    | 'generate_caption'
    | 'generate_image'
    | 'generate_carousel'
    | 'improve_text'
    | 'analyze_workspace'
    | 'inspect_posts'
    | 'inspect_automations'
    | 'create_draft'
    | 'schedule_post'
    | 'general_chat'
  confidence: 'high' | 'medium' | 'low'
  needsConfirmation: boolean
}
```

## Context Engine

The assistant should fetch only the context needed for the current mode/action.

Context packs:

1. Brand pack
   - Business name
   - Industry
   - Brand voice
   - Target audience
   - Content themes
   - Colors and assets summary

2. Content pack
   - Recent posts
   - Drafts
   - Scheduled posts
   - Selected post when present

3. Analytics pack
   - Fresh summary from the analytics read-through sync path
   - Top posts
   - Best format/topic/hashtag/time where available
   - Date range label

4. Automation pack
   - Active automations
   - Recent runs/errors where available
   - Template names and status

5. Account pack
   - Connected social accounts
   - Platform availability
   - Missing permission/capability hints

Context should be assembled server-side to prevent client-side data leakage and reduce duplicate UI fetching.

## Backend Shape

Keep `/api/assistant/invoke` as the authenticated gateway, but introduce a higher-level app route for command-center flows.

Recommended route:

`POST /api/assistant/command`

Input:

```ts
type AssistantCommandRequest = {
  message: string
  mode?: AssistantMode
  sessionId?: string | null
  attachments?: Array<{ base64: string; mimeType: string; name?: string }>
  selectedContext?: {
    postId?: string
    draftId?: string
    analyticsRange?: '7d' | '30d' | '90d'
    automationId?: string
  }
}
```

Output:

```ts
type AssistantCommandResponse = {
  assistantMessage: AssistantMessage
  cards: AssistantCard[]
  suggestedActions: AssistantSuggestedAction[]
  pendingAction?: AssistantPendingAction
}
```

This route can call existing Edge Functions in Phase 1, then gradually move logic into dedicated server helpers.

## Structured Cards

Assistant outputs should render as typed cards instead of plain text whenever possible.

Card types:

1. `idea_list`
2. `caption_variants`
3. `draft_preview`
4. `image_result`
5. `carousel_preview`
6. `analytics_insight`
7. `post_list`
8. `automation_summary`
9. `confirmation`
10. `error_recovery`

Each card should include stable action buttons. Examples:

1. Use as draft
2. Improve
3. Generate image
4. Schedule
5. Copy
6. Open post
7. Create automation
8. Confirm
9. Cancel

## Confirmation Rules

Any action that writes or changes data requires confirmation.

Requires confirmation:

1. Create draft.
2. Update draft.
3. Schedule or reschedule post.
4. Delete draft/post.
5. Create, activate, pause, or delete automation.
6. Update brand profile.
7. Upload or generate persistent media attached to a post.

Does not require confirmation:

1. Generate ideas.
2. Generate text variants.
3. Analyze analytics.
4. Read lists of posts, automations, or accounts.
5. Copy text.

Confirmation cards must state:

1. What will change.
2. Which object is affected.
3. Any platform/date involved.
4. The exact primary action button.

## Error Handling

The assistant should recover with specific next steps, not generic "Something went wrong" messages.

Examples:

1. Missing AI provider key
   - Explain the missing provider and link to Settings.

2. Image model unavailable
   - Suggest switching image model in Settings.

3. No connected account
   - Offer to open social account settings.

4. Analytics stale or unavailable
   - Trigger read-through analytics refresh if allowed, then report if still unavailable.

5. Meta permission/capability missing
   - Explain whether this is app-review/testing-role related or token-scope related.

6. Write action failed
   - Show what was attempted, what failed, and offer retry or manual open.

## Mobile UX Requirements

1. No card should require horizontal scrolling.
2. Mode chips must wrap or scroll horizontally with clear active state.
3. Composer must remain reachable at the bottom.
4. Attachments preview as a compact strip above the composer.
5. History should open as a full-height sheet.
6. Confirmation cards should keep primary action and cancel visible without scrolling when possible.
7. Text must not overflow buttons or card headers.

## Implementation Phases

### Phase 1: Assistant Shell and Intent Routing

Scope:

1. Split `app/dashboard/assistant/chat-interface.tsx` into smaller components.
2. Add visible modes and mode chips.
3. Replace hidden `activeFunction` behavior with intent routing.
4. Keep existing Edge Functions working.
5. Improve mobile layout and empty state.
6. Add typed message/card model.

Success criteria:

1. User can see and switch the assistant mode.
2. Existing ideas, image, carousel, and brand-image flows still work.
3. Mobile page is usable without layout overflow.
4. Chat history still works.

### Phase 2: Context-Aware Assistant

Scope:

1. Add server-side context pack builder.
2. Pull brand, recent posts, scheduled posts, analytics summary, active automations, and connected accounts as needed.
3. Improve `chat-assistant` system instruction so it uses real workspace context.
4. Add context drawer/sheet.

Success criteria:

1. Assistant can answer "what should I post next?" using real brand/content context.
2. Assistant can explain analytics without requiring the dashboard page to be opened first.
3. Assistant responses identify their data source where relevant.

### Phase 3: Confirmed Write Actions

Scope:

1. Add pending action cards.
2. Create drafts from assistant outputs.
3. Update drafts with confirmation.
4. Schedule/reschedule posts with confirmation.
5. Inspect and manage automations with confirmation.

Success criteria:

1. No write action happens without visible confirmation.
2. User can create a post draft from an assistant-generated idea or image.
3. User can inspect scheduled posts and update a draft safely.

### Phase 4: Premium and Connector Power Layer

Scope:

1. Align assistant capabilities with Developer API/MCP scopes.
2. Add paid-plan limits for heavy assistant actions.
3. Add media storage limits and cleanup awareness.
4. Expose higher-power app operations only after reliability testing.

Success criteria:

1. Assistant uses the same access model as Developer API where possible.
2. Paid-plan limits are visible and enforceable.
3. Storage-heavy media actions respect retention and quota strategy.

## File Boundaries

Likely frontend files:

1. `app/dashboard/assistant/chat-interface.tsx`
2. `app/dashboard/assistant/components/*`
3. New assistant mode/components under `app/dashboard/assistant/components/command-center/*`
4. `components/layout/mobile-nav.tsx` only if nav spacing needs adjustment

Likely backend files:

1. `app/api/assistant/invoke/route.ts`
2. New `app/api/assistant/command/route.ts`
3. New `lib/assistant/intent-router.ts`
4. New `lib/assistant/context-packs.ts`
5. New `lib/assistant/cards.ts`
6. `supabase/functions/chat-assistant/index.ts`

Likely tests:

1. `tests/developer-api` or new `tests/assistant`
2. Intent router unit tests
3. Context pack authorization tests
4. Confirmation action tests
5. Responsive UI smoke test with Playwright when implementation reaches UI polish

## Design Self-Review

Placeholder scan:

No unresolved placeholder text remains. Future phases are named intentionally and have default scope.

Consistency check:

The UX, routing, backend route, cards, and confirmation model all use the same mode/action structure.

Scope check:

This is intentionally split into four phases. Phase 1 is small enough to implement without rewriting all assistant backends.

Ambiguity check:

The key behavior is explicit: mode is visible, routing is deterministic first, context is fetched server-side, and writes require confirmation.
