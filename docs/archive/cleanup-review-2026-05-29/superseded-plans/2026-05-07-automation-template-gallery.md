# Automation Template Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wizard/canvas-first creation flow with a template gallery that turns each user-confirmed scenario into a single-screen form. Each form compiles to a fixed `WorkflowGraph` and saves as a draft canvas automation.

**Architecture:** Each template is defined declaratively as `{ metadata, fields[], buildGraphFromForm(values) }`. A generic `TemplateFormModal` renders any field schema and POSTs the compiled graph to `/api/automations` (as a draft canvas automation). The gallery becomes the default entry on `app/dashboard/automation/page.tsx`; the existing wizard/canvas remain accessible as advanced fallbacks.

**Tech Stack:** Next.js 16 App Router (client components), TypeScript, Tailwind v4, shadcn/ui (`Dialog`, `Input`, `Textarea`, `Switch`, `Label`, `Button`), `useSWR`, lucide-react icons, existing `WorkflowGraph` types from `types/automation-graph.ts`.

**No test suite exists in this repo (`CLAUDE.md`: "No test command").** Verification per task is type-check + lint + manual UI smoke test:

```bash
npm run lint
npm run build   # only when types or large refactors changed
```

**Out of scope (deferred to a follow-up plan):**
- Template #7 "Daily AI post" — needs to plug into `process-scheduled-posts` / `PublishingAutomationsPanel`, not the engagement graph engine. There is no `action_create_post` node today.
- Migrating the legacy `AutomationSetupModal` (comment→DM modal) into the new gallery — for now the gallery covers the same scenario via Template #2.

---

## Catalog (user-confirmed)

| # | id | Trigger | Action(s) | Platforms |
|---|---|---|---|---|
| 1 | `tpl-reply-comments-ai` | New comment | AI Response → Reply to comment | IG, FB |
| 2 | `tpl-dm-commenters-link` | New comment | Reply to comment → Send DM (with button) | IG |
| 3 | `tpl-private-reply-commenters` | New comment | (optional AI Response) → Private reply | IG |
| 4 | `tpl-dm-ai-autoreply` | New message | AI Response → Send DM | IG |
| 5 | `tpl-welcome-followers` | New follower | (optional AI Response) → Send DM | IG |
| 6 | `tpl-story-mention-reply` | Story mention | (optional AI Response) → Send DM | IG |

---

## File Structure

**New:**
- `lib/automation-templates/types.ts` — `TemplateField`, `TemplateFieldType`, extended `AutomationTemplateDefinition`
- `lib/automation-templates/utils.ts` — `buildGraphFromBlueprint`, `templateNode`, `templateEdge` (moved from current single file)
- `lib/automation-templates/templates/reply-comments-ai.ts`
- `lib/automation-templates/templates/dm-commenters-link.ts`
- `lib/automation-templates/templates/private-reply-commenters.ts`
- `lib/automation-templates/templates/dm-ai-autoreply.ts`
- `lib/automation-templates/templates/welcome-followers.ts`
- `lib/automation-templates/templates/story-mention-reply.ts`
- `lib/automation-templates/index.ts` — barrel that re-exports `AUTOMATION_TEMPLATES`, `getAutomationTemplateById`, types, utils
- `components/automation/templates/template-gallery.tsx` — grid of cards
- `components/automation/templates/template-form-modal.tsx` — generic schema-driven form
- `components/automation/templates/fields/social-account-field.tsx`
- `components/automation/templates/fields/post-or-all-field.tsx`
- `components/automation/templates/fields/tone-field.tsx`
- `components/automation/templates/fields/keywords-field.tsx`

**Modified:**
- `lib/automation-templates.ts` — becomes a back-compat shim that re-exports from `lib/automation-templates/index.ts` (the existing canvas template picker keeps working unchanged)
- `app/dashboard/automation/page.tsx` — adds `editorView: 'gallery'`, new state for selected template, makes gallery the default entry from the "New Automation" button
- `components/automation/automation-card.tsx` — no logic change; we just add new cards on the page

---

## Conventions used by every template

1. Templates compile to canvas graphs and save with `editor_version: 'canvas'`, `is_active: false` (drafts), via `POST /api/automations` (already used by canvas — see `app/dashboard/automation/page.tsx:185-214`).
2. Every template builds graphs through `buildGraphFromBlueprint` (relocated from `lib/automation-templates.ts`), so node/edge ID generation is consistent.
3. AI-driven templates use `action_ai_response` followed by an action whose `use_ai_response: true` and message body `'{{ai_response}}'` — same pattern as the existing `comment-ai-reply-dm` template (`lib/automation-templates.ts:140-209`).
4. Account picking uses the existing `/api/automations/social-accounts?platform=<ig|fb>` endpoint. The reference fetch pattern lives in `components/automation/wizard/trigger-step.tsx:79-141`.
5. Post picking uses the existing `PostSelector` (`components/automation/post-selector.tsx`) plus an "All posts" switch that, when on, leaves `post_id` empty in the trigger config.
6. Tone presets match `WizardAiConfig`: `friendly | professional | playful | empathetic | sales` (from `lib/automation-wizard/types.ts:31`).

---

## Task 1: Add the template schema types

**Files:**
- Create: `lib/automation-templates/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// lib/automation-templates/types.ts
import type { LucideIcon } from 'lucide-react'
import type { WorkflowGraph } from '@/types/automation-graph'

export type AutomationTemplatePlatform = 'instagram' | 'facebook'

export type TemplateFieldType =
  | 'social_account'
  | 'post_or_all'
  | 'text'
  | 'textarea'
  | 'url'
  | 'switch'
  | 'tone'
  | 'keywords'

export interface TemplateField {
  id: string
  type: TemplateFieldType
  label: string
  placeholder?: string
  helpText?: string
  required?: boolean
  defaultValue?: unknown
  // Platform attached to social_account fields so we know which API to call.
  platform?: AutomationTemplatePlatform
  // Simple conditional visibility: show only when another field equals a given value.
  showWhen?: { fieldId: string; equals: unknown }
  // For 'switch' fields that gate AI mode on another field.
  toggles?: { fieldId: string; whenTrue: unknown; whenFalse: unknown }
}

export type TemplateFormValues = Record<string, unknown>

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'comments' | 'messages' | 'growth' | 'mentions'
  icon: LucideIcon
  supportedPlatforms: AutomationTemplatePlatform[]
  tags?: string[]
  fields: TemplateField[]
  buildGraphFromForm: (values: TemplateFormValues) => WorkflowGraph
  defaultName: (values: TemplateFormValues) => string
  // Kept for the existing canvas template picker. Returns a graph with
  // empty/default config for users who pick the template and want to
  // edit it on the canvas.
  buildGraph: () => WorkflowGraph
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: passes (file has no consumers yet so no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/automation-templates/types.ts
git commit -m "Add template schema types for automation gallery"
```

---

## Task 2: Extract graph helpers into a shared utils module

**Files:**
- Create: `lib/automation-templates/utils.ts`

- [ ] **Step 1: Move helpers verbatim from `lib/automation-templates.ts`**

Copy the three helpers (`templateNode`, `templateEdge`, `buildGraphFromBlueprint`) and their imports from `lib/automation-templates.ts:1-81` into the new file as named exports. Do not yet edit the original file — Task 9 deletes it.

```ts
// lib/automation-templates/utils.ts
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeType,
} from '@/types/automation-graph'
import { getDefaultConfig } from '@/types/automation-graph'

export function templateNode(
  id: string,
  type: WorkflowNodeType,
  label: string,
  position: { x: number; y: number },
  configOverrides: Record<string, unknown> = {},
): WorkflowNode {
  const baseConfig = getDefaultConfig(type) as unknown as Record<string, unknown>
  return {
    id,
    type: type.startsWith('trigger_') ? 'trigger' : 'action',
    position,
    data: {
      type,
      label,
      config: { ...baseConfig, ...configOverrides },
    } as unknown as WorkflowNodeData,
  }
}

export function templateEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
): WorkflowEdge {
  return {
    id,
    source,
    target,
    type: 'custom',
    animated: true,
    data: label ? { label } : undefined,
  }
}

export function buildGraphFromBlueprint(
  nodesBlueprint: Array<{
    key: string
    type: WorkflowNodeType
    label: string
    position: { x: number; y: number }
    config?: Record<string, unknown>
  }>,
  edgesBlueprint: Array<{ source: string; target: string; label?: string }>,
): WorkflowGraph {
  const prefix = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const keyToId = new Map<string, string>()
  const nodes: WorkflowNode[] = nodesBlueprint.map((node) => {
    const id = `${prefix}-${node.key}`
    keyToId.set(node.key, id)
    return templateNode(id, node.type, node.label, node.position, node.config || {})
  })
  const edges: WorkflowEdge[] = edgesBlueprint.map((edge, index) =>
    templateEdge(
      `${prefix}-edge-${index + 1}`,
      keyToId.get(edge.source) || edge.source,
      keyToId.get(edge.target) || edge.target,
      edge.label,
    ),
  )
  return { nodes, edges }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-templates/utils.ts
git commit -m "Extract template graph helpers into shared utils module"
```

---

## Task 3: Template — Reply to comments with AI

**Files:**
- Create: `lib/automation-templates/templates/reply-comments-ai.ts`

- [ ] **Step 1: Write the template**

```ts
// lib/automation-templates/templates/reply-comments-ai.ts
import { MessageSquareReply } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const replyCommentsAi: AutomationTemplateDefinition = {
  id: 'tpl-reply-comments-ai',
  name: 'Reply to comments with AI',
  description: 'Auto-generate a friendly reply for every new comment on a post (or all posts).',
  category: 'comments',
  icon: MessageSquareReply,
  supportedPlatforms: ['instagram', 'facebook'],
  tags: ['comments', 'ai', 'engagement'],
  fields: [
    {
      id: 'platform',
      type: 'switch',
      label: 'Use Facebook instead of Instagram',
      defaultValue: false,
      helpText: 'Toggle on to apply the automation to a Facebook page comment.',
    },
    { id: 'social_account_id', type: 'social_account', label: 'Account', required: true },
    {
      id: 'post_or_all',
      type: 'post_or_all',
      label: 'Apply to',
      helpText: 'Pick a single post, or leave on "All posts" to react to every comment.',
    },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
    },
    {
      id: 'keywords',
      type: 'keywords',
      label: 'Only reply when comment contains',
      helpText: 'Leave empty to reply to every comment.',
      defaultValue: [],
    },
  ],
  defaultName: (values) => {
    const platform = values.platform ? 'Facebook' : 'Instagram'
    return `${platform} — AI reply to comments`
  },
  buildGraphFromForm: (values) => {
    const platform = values.platform ? 'facebook' : 'instagram'
    const triggerType = Array.isArray(values.keywords) && values.keywords.length > 0 ? 'keywords' : 'any'
    return buildGraphFromBlueprint(
      [
        {
          key: 'trigger_comment',
          type: 'trigger_new_comment',
          label: 'New Comment',
          position: { x: 100, y: 140 },
          config: {
            platform,
            trigger_type: triggerType,
            keywords: values.keywords || [],
            social_account_id: String(values.social_account_id || ''),
            post_id: values.post_or_all === 'all' ? '' : String(values.post_id || ''),
            post_thumbnail_url: '',
            post_caption: '',
          },
        },
        {
          key: 'ai_response',
          type: 'action_ai_response',
          label: 'AI Response',
          position: { x: 380, y: 120 },
          config: {
            use_global_settings: true,
            max_tokens: 500,
            preset_goal: 'reply_comment',
            tone: values.tone || 'friendly',
            length: 'short',
            emoji_level: 'light',
          },
        },
        {
          key: 'reply_comment',
          type: 'action_reply_comment',
          label: 'Reply to Comment',
          position: { x: 670, y: 120 },
          config: {
            use_ai_response: true,
            messages: ['{{ai_response}}'],
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'ai_response' },
        { source: 'ai_response', target: 'reply_comment' },
      ],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      platform: false,
      social_account_id: '',
      post_or_all: 'all',
      post_id: '',
      tone: 'friendly',
      keywords: [],
    })
  },
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-templates/templates/reply-comments-ai.ts
git commit -m "Add template: AI-powered reply to comments"
```

---

## Task 4: Template — DM commenters with link

**Files:**
- Create: `lib/automation-templates/templates/dm-commenters-link.ts`

- [ ] **Step 1: Write the template**

```ts
// lib/automation-templates/templates/dm-commenters-link.ts
import { Send } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const dmCommentersLink: AutomationTemplateDefinition = {
  id: 'tpl-dm-commenters-link',
  name: 'DM commenters with a link',
  description: 'Reply publicly, then DM each commenter a button that opens your link.',
  category: 'comments',
  icon: Send,
  supportedPlatforms: ['instagram'],
  tags: ['comments', 'dm', 'lead magnet'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    {
      id: 'post_or_all',
      type: 'post_or_all',
      label: 'Trigger post',
      required: true,
    },
    {
      id: 'reply_message',
      type: 'textarea',
      label: 'Public reply',
      defaultValue: 'Thanks for your comment. Check your inbox.',
      required: true,
    },
    {
      id: 'opening_message',
      type: 'textarea',
      label: 'DM opening message',
      defaultValue: 'Thanks for commenting. Here is the link you requested.',
      required: true,
    },
    { id: 'button_text', type: 'text', label: 'Button text', defaultValue: 'Open Link', required: true },
    { id: 'link_url', type: 'url', label: 'URL', required: true, placeholder: 'https://example.com' },
    {
      id: 'fallback_to_private_reply',
      type: 'switch',
      label: 'If DM fails, try a private reply instead',
      defaultValue: true,
    },
  ],
  defaultName: () => 'IG — DM commenters a link',
  buildGraphFromForm: (values) => {
    return buildGraphFromBlueprint(
      [
        {
          key: 'trigger_comment',
          type: 'trigger_new_comment',
          label: 'New Comment',
          position: { x: 100, y: 140 },
          config: {
            platform: 'instagram',
            trigger_type: 'any',
            keywords: [],
            social_account_id: String(values.social_account_id || ''),
            post_id: values.post_or_all === 'all' ? '' : String(values.post_id || ''),
            post_thumbnail_url: '',
            post_caption: '',
          },
        },
        {
          key: 'reply_comment',
          type: 'action_reply_comment',
          label: 'Reply to Comment',
          position: { x: 380, y: 100 },
          config: {
            use_ai_response: false,
            messages: [String(values.reply_message || '')],
          },
        },
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 680, y: 100 },
          config: {
            use_ai_response: false,
            opening_message: String(values.opening_message || ''),
            button_text: String(values.button_text || ''),
            link_url: String(values.link_url || ''),
            link_message: `If the button does not work, use this link: ${String(values.link_url || '')}`,
            fallback_to_private_reply_on_failure: Boolean(values.fallback_to_private_reply),
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'reply_comment' },
        { source: 'reply_comment', target: 'send_dm' },
      ],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      post_or_all: 'all',
      post_id: '',
      reply_message: 'Thanks for your comment. Check your inbox.',
      opening_message: 'Thanks for commenting. Here is the link you requested.',
      button_text: 'Open Link',
      link_url: 'https://example.com',
      fallback_to_private_reply: true,
    })
  },
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-templates/templates/dm-commenters-link.ts
git commit -m "Add template: DM commenters with a link"
```

---

## Task 5: Template — Private reply to commenters

**Files:**
- Create: `lib/automation-templates/templates/private-reply-commenters.ts`

- [ ] **Step 1: Write the template**

```ts
// lib/automation-templates/templates/private-reply-commenters.ts
import { Lock } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const privateReplyCommenters: AutomationTemplateDefinition = {
  id: 'tpl-private-reply-commenters',
  name: 'Private reply to commenters',
  description: 'Send a private DM reply directly off a comment trigger (Instagram only).',
  category: 'comments',
  icon: Lock,
  supportedPlatforms: ['instagram'],
  tags: ['comments', 'private-reply'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'post_or_all', type: 'post_or_all', label: 'Trigger post' },
    { id: 'use_ai', type: 'switch', label: 'Generate the reply with AI', defaultValue: false },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
      showWhen: { fieldId: 'use_ai', equals: true },
    },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message',
      defaultValue: 'Thanks for reaching out — sliding into your DMs now.',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Private reply to comments',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const triggerNode = {
      key: 'trigger_comment',
      type: 'trigger_new_comment' as const,
      label: 'New Comment',
      position: { x: 100, y: 140 },
      config: {
        platform: 'instagram',
        trigger_type: 'any',
        keywords: [],
        social_account_id: String(values.social_account_id || ''),
        post_id: values.post_or_all === 'all' ? '' : String(values.post_id || ''),
        post_thumbnail_url: '',
        post_caption: '',
      },
    }
    if (useAi) {
      return buildGraphFromBlueprint(
        [
          triggerNode,
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 380, y: 120 },
            config: {
              use_global_settings: true,
              max_tokens: 500,
              preset_goal: 'reply_comment',
              tone: values.tone || 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'private_reply',
            type: 'action_private_reply',
            label: 'Private Reply',
            position: { x: 670, y: 120 },
            config: { use_ai_response: true, message: '{{ai_response}}' },
          },
        ],
        [
          { source: 'trigger_comment', target: 'ai_response' },
          { source: 'ai_response', target: 'private_reply' },
        ],
      )
    }
    return buildGraphFromBlueprint(
      [
        triggerNode,
        {
          key: 'private_reply',
          type: 'action_private_reply',
          label: 'Private Reply',
          position: { x: 380, y: 120 },
          config: { use_ai_response: false, message: String(values.message || '') },
        },
      ],
      [{ source: 'trigger_comment', target: 'private_reply' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      post_or_all: 'all',
      post_id: '',
      use_ai: false,
      message: 'Thanks for reaching out — sliding into your DMs now.',
    })
  },
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add lib/automation-templates/templates/private-reply-commenters.ts
git commit -m "Add template: private reply to commenters"
```

---

## Task 6: Template — AI auto-reply to DMs

**Files:**
- Create: `lib/automation-templates/templates/dm-ai-autoreply.ts`

- [ ] **Step 1: Write the template**

```ts
// lib/automation-templates/templates/dm-ai-autoreply.ts
import { Sparkles } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const dmAiAutoreply: AutomationTemplateDefinition = {
  id: 'tpl-dm-ai-autoreply',
  name: 'AI auto-reply to DMs',
  description: 'Respond to incoming Instagram DMs with an AI-generated reply.',
  category: 'messages',
  icon: Sparkles,
  supportedPlatforms: ['instagram'],
  tags: ['dm', 'ai', 'support'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'tone', type: 'tone', label: 'AI tone', defaultValue: 'friendly' },
  ],
  defaultName: () => 'IG — AI auto-reply to DMs',
  buildGraphFromForm: (values) => buildGraphFromBlueprint(
    [
      {
        key: 'trigger_message',
        type: 'trigger_new_message',
        label: 'New Message',
        position: { x: 100, y: 130 },
        config: {
          platform: 'instagram',
          trigger_type: 'any',
          keywords: [],
          social_account_id: String(values.social_account_id || ''),
        },
      },
      {
        key: 'ai_response',
        type: 'action_ai_response',
        label: 'AI Response',
        position: { x: 400, y: 110 },
        config: {
          use_global_settings: true,
          max_tokens: 600,
          preset_goal: 'support_answer',
          tone: values.tone || 'friendly',
          length: 'medium',
          emoji_level: 'light',
        },
      },
      {
        key: 'send_dm',
        type: 'action_send_dm',
        label: 'Send DM',
        position: { x: 700, y: 110 },
        config: {
          use_ai_response: true,
          opening_message: '{{ai_response}}',
          button_text: '',
          link_url: '',
          link_message: '',
        },
      },
    ],
    [
      { source: 'trigger_message', target: 'ai_response' },
      { source: 'ai_response', target: 'send_dm' },
    ],
  ),
  buildGraph: function () {
    return this.buildGraphFromForm({ social_account_id: '', tone: 'friendly' })
  },
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add lib/automation-templates/templates/dm-ai-autoreply.ts
git commit -m "Add template: AI auto-reply to DMs"
```

---

## Task 7: Template — Welcome new followers

**Files:**
- Create: `lib/automation-templates/templates/welcome-followers.ts`

- [ ] **Step 1: Write the template**

```ts
// lib/automation-templates/templates/welcome-followers.ts
import { UserPlus } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const welcomeFollowers: AutomationTemplateDefinition = {
  id: 'tpl-welcome-followers',
  name: 'Welcome new followers',
  description: 'Send a welcome DM the moment someone follows your Instagram account.',
  category: 'growth',
  icon: UserPlus,
  supportedPlatforms: ['instagram'],
  tags: ['followers', 'growth', 'dm'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'use_ai', type: 'switch', label: 'Generate the message with AI', defaultValue: false },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
      showWhen: { fieldId: 'use_ai', equals: true },
    },
    {
      id: 'opening_message',
      type: 'textarea',
      label: 'Welcome message',
      defaultValue: 'Welcome aboard! Thanks for following — let me know what you’d like to see more of.',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Welcome new followers',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const trigger = {
      key: 'trigger_follower',
      type: 'trigger_new_follower' as const,
      label: 'New Follower',
      position: { x: 100, y: 130 },
      config: {
        platform: 'instagram',
        social_account_id: String(values.social_account_id || ''),
      },
    }
    if (useAi) {
      return buildGraphFromBlueprint(
        [
          trigger,
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 400, y: 110 },
            config: {
              use_global_settings: true,
              max_tokens: 400,
              preset_goal: 'welcome_new_follower',
              tone: values.tone || 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 700, y: 110 },
            config: {
              use_ai_response: true,
              opening_message: '{{ai_response}}',
              button_text: '',
              link_url: '',
              link_message: '',
            },
          },
        ],
        [
          { source: 'trigger_follower', target: 'ai_response' },
          { source: 'ai_response', target: 'send_dm' },
        ],
      )
    }
    return buildGraphFromBlueprint(
      [
        trigger,
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 400, y: 110 },
          config: {
            use_ai_response: false,
            opening_message: String(values.opening_message || ''),
            button_text: '',
            link_url: '',
            link_message: '',
          },
        },
      ],
      [{ source: 'trigger_follower', target: 'send_dm' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      use_ai: false,
      opening_message: 'Welcome aboard!',
    })
  },
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add lib/automation-templates/templates/welcome-followers.ts
git commit -m "Add template: welcome new followers"
```

---

## Task 8: Template — Reply to story mentions

**Files:**
- Create: `lib/automation-templates/templates/story-mention-reply.ts`

- [ ] **Step 1: Write the template**

Mirror Task 7's structure exactly, swapping:
- `id`: `tpl-story-mention-reply`
- icon: `import { AtSign } from 'lucide-react'`
- name: `'Reply to story mentions'`
- description: `'Auto-DM the person who tagged you in their Instagram story.'`
- category: `'mentions'`
- trigger key/type/label: `trigger_story_mention` / `'Story Mention'`
- defaultValue for non-AI message: `'Thanks for the story tag! 🙌'`
- preset_goal stays `'reply_comment'` (closest match — there is no `'story_mention'` preset; see `lib/automation-wizard/types.ts:31`).
- defaultName: `() => 'IG — Reply to story mentions'`

```ts
// lib/automation-templates/templates/story-mention-reply.ts
import { AtSign } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const storyMentionReply: AutomationTemplateDefinition = {
  id: 'tpl-story-mention-reply',
  name: 'Reply to story mentions',
  description: 'Auto-DM the person who tagged you in their Instagram story.',
  category: 'mentions',
  icon: AtSign,
  supportedPlatforms: ['instagram'],
  tags: ['stories', 'mentions', 'dm'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'use_ai', type: 'switch', label: 'Generate the reply with AI', defaultValue: false },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
      showWhen: { fieldId: 'use_ai', equals: true },
    },
    {
      id: 'opening_message',
      type: 'textarea',
      label: 'Reply message',
      defaultValue: 'Thanks for the story tag! 🙌',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Reply to story mentions',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const trigger = {
      key: 'trigger_mention',
      type: 'trigger_story_mention' as const,
      label: 'Story Mention',
      position: { x: 100, y: 130 },
      config: {
        platform: 'instagram',
        social_account_id: String(values.social_account_id || ''),
      },
    }
    if (useAi) {
      return buildGraphFromBlueprint(
        [
          trigger,
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 400, y: 110 },
            config: {
              use_global_settings: true,
              max_tokens: 400,
              preset_goal: 'reply_comment',
              tone: values.tone || 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 700, y: 110 },
            config: {
              use_ai_response: true,
              opening_message: '{{ai_response}}',
              button_text: '',
              link_url: '',
              link_message: '',
            },
          },
        ],
        [
          { source: 'trigger_mention', target: 'ai_response' },
          { source: 'ai_response', target: 'send_dm' },
        ],
      )
    }
    return buildGraphFromBlueprint(
      [
        trigger,
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 400, y: 110 },
          config: {
            use_ai_response: false,
            opening_message: String(values.opening_message || ''),
            button_text: '',
            link_url: '',
            link_message: '',
          },
        },
      ],
      [{ source: 'trigger_mention', target: 'send_dm' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      use_ai: false,
      opening_message: 'Thanks for the story tag! 🙌',
    })
  },
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add lib/automation-templates/templates/story-mention-reply.ts
git commit -m "Add template: reply to story mentions"
```

---

## Task 9: Build the index barrel and migrate the legacy file

**Files:**
- Create: `lib/automation-templates/index.ts`
- Modify: `lib/automation-templates.ts` (becomes a re-export shim so existing `AutomationTemplatePicker` keeps working)

- [ ] **Step 1: Write the barrel**

```ts
// lib/automation-templates/index.ts
import { replyCommentsAi } from './templates/reply-comments-ai'
import { dmCommentersLink } from './templates/dm-commenters-link'
import { privateReplyCommenters } from './templates/private-reply-commenters'
import { dmAiAutoreply } from './templates/dm-ai-autoreply'
import { welcomeFollowers } from './templates/welcome-followers'
import { storyMentionReply } from './templates/story-mention-reply'

import type { AutomationTemplateDefinition, AutomationTemplatePlatform } from './types'

export type { AutomationTemplateDefinition, AutomationTemplatePlatform } from './types'
export type { TemplateField, TemplateFieldType, TemplateFormValues } from './types'
export { buildGraphFromBlueprint, templateNode, templateEdge } from './utils'

export const AUTOMATION_TEMPLATES: AutomationTemplateDefinition[] = [
  replyCommentsAi,
  dmCommentersLink,
  privateReplyCommenters,
  dmAiAutoreply,
  welcomeFollowers,
  storyMentionReply,
]

export function getAutomationTemplateById(templateId: string) {
  return AUTOMATION_TEMPLATES.find((template) => template.id === templateId) || null
}
```

- [ ] **Step 2: Replace `lib/automation-templates.ts` with a re-export shim**

```ts
// lib/automation-templates.ts
// Back-compat shim. The canvas template picker imports from this path.
// New code should import from `@/lib/automation-templates/index` directly.
export * from './automation-templates/index'
```

(Delete the old hand-written templates and helpers in this file — they are now covered by the new barrel + per-template modules.)

- [ ] **Step 3: Verify the canvas picker still imports successfully**

```bash
npm run lint
npm run build
```
Expected: passes. The existing `components/automation/automation-template-picker.tsx` and `app/dashboard/automation/page.tsx` keep importing `@/lib/automation-templates` and resolve to the new templates.

- [ ] **Step 4: Commit**

```bash
git add lib/automation-templates.ts lib/automation-templates/index.ts
git commit -m "Migrate automation templates to per-file modules with shared barrel"
```

---

## Task 10: Generic field components (text/textarea/url/switch/keywords/tone)

**Files:**
- Create: `components/automation/templates/fields/tone-field.tsx`
- Create: `components/automation/templates/fields/keywords-field.tsx`

- [ ] **Step 1: Tone field**

Tone presets must match the `WizardAiConfig` enum in `lib/automation-wizard/types.ts:31`.

```tsx
// components/automation/templates/fields/tone-field.tsx
"use client"

const TONES: Array<{ value: 'friendly' | 'professional' | 'playful' | 'empathetic' | 'sales'; label: string }> = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'sales', label: 'Sales' },
]

export function ToneField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-white/80">{label}</label>
      <div className="flex flex-wrap gap-2">
        {TONES.map((tone) => {
          const isActive = value === tone.value
          return (
            <button
              key={tone.value}
              type="button"
              onClick={() => onChange(tone.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-300/40'
                  : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              {tone.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Keywords field**

```tsx
// components/automation/templates/fields/keywords-field.tsx
"use client"

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function KeywordsField({
  value,
  onChange,
  label,
  helpText,
}: {
  value: string[]
  onChange: (next: string[]) => void
  label: string
  helpText?: string
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (value.includes(trimmed)) {
      setDraft('')
      return
    }
    onChange([...value, trimmed])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          placeholder="Type a keyword and press Enter"
          className="bg-white/[0.04] text-white placeholder:text-white/30"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/80"
            >
              {keyword}
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== keyword))}
                className="text-white/50 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {helpText && <p className="text-xs leading-relaxed text-white/45">{helpText}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add components/automation/templates/fields/tone-field.tsx components/automation/templates/fields/keywords-field.tsx
git commit -m "Add tone and keywords field components for template forms"
```

---

## Task 11: Account picker + post selector field components

**Files:**
- Create: `components/automation/templates/fields/social-account-field.tsx`
- Create: `components/automation/templates/fields/post-or-all-field.tsx`

- [ ] **Step 1: Social account field**

Reuse the SWR + endpoint pattern from `components/automation/wizard/trigger-step.tsx:79-141`.

```tsx
// components/automation/templates/fields/social-account-field.tsx
"use client"

import useSWR from 'swr'
import { Label } from '@/components/ui/label'

interface SocialAccountOption {
  id: string
  username: string
  platform: 'instagram' | 'facebook'
}

const fetcher = async (url: string): Promise<{ accounts: SocialAccountOption[] }> => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to load accounts')
  return data
}

export function SocialAccountField({
  value,
  onChange,
  platform,
  label,
  required,
}: {
  value: string
  onChange: (id: string) => void
  platform: 'instagram' | 'facebook'
  label: string
  required?: boolean
}) {
  const { data, isLoading } = useSWR(
    `/api/automations/social-accounts?platform=${platform}`,
    fetcher,
  )
  const accounts = data?.accounts || []
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      {isLoading ? (
        <p className="text-xs text-white/45">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-amber-300">
          No {platform === 'facebook' ? 'Facebook pages' : 'Instagram accounts'} connected. Connect one in Settings first.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => {
            const isActive = value === account.id
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => onChange(account.id)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-300/40'
                    : 'bg-white/[0.04] text-white/80 hover:bg-white/[0.08]'
                }`}
              >
                <span>@{account.username}</span>
                <span className="text-xs uppercase tracking-wider text-white/40">{account.platform}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Post-or-all field**

```tsx
// components/automation/templates/fields/post-or-all-field.tsx
"use client"

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PostSelector } from '@/components/automation/post-selector'

export function PostOrAllField({
  socialAccountId,
  selection, // 'all' or a post id
  onChange,
  label,
  required,
}: {
  socialAccountId: string
  selection: string
  onChange: (next: { selection: 'all' | string; postId: string }) => void
  label: string
  required?: boolean
}) {
  const isAll = selection === 'all' || !selection
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      <div className="flex items-center gap-3">
        <Switch
          checked={isAll}
          onCheckedChange={(checked) =>
            onChange({ selection: checked ? 'all' : '', postId: '' })
          }
        />
        <span className="text-sm text-white/75">Apply to all posts</span>
      </div>
      {!isAll && socialAccountId && (
        <PostSelector
          socialAccountId={socialAccountId}
          selectedPostId={selection === 'all' ? '' : selection}
          onSelect={(post) => onChange({ selection: post.id, postId: post.id })}
        />
      )}
      {!isAll && !socialAccountId && (
        <p className="text-xs text-amber-300">Pick an account first to choose a post.</p>
      )}
    </div>
  )
}
```

> **Note:** verify the actual prop names on `PostSelector` (`components/automation/post-selector.tsx`) before finalizing — they may be `onPostSelected` / `accountId`. Fix the call shape to match real prop names; do not invent props.

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add components/automation/templates/fields/social-account-field.tsx components/automation/templates/fields/post-or-all-field.tsx
git commit -m "Add social account and post-or-all field components"
```

---

## Task 12: Generic schema-driven `TemplateFormModal`

**Files:**
- Create: `components/automation/templates/template-form-modal.tsx`

- [ ] **Step 1: Build the modal**

```tsx
// components/automation/templates/template-form-modal.tsx
"use client"

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import type {
  AutomationTemplateDefinition,
  TemplateField,
  TemplateFormValues,
} from '@/lib/automation-templates'
import { ToneField } from './fields/tone-field'
import { KeywordsField } from './fields/keywords-field'
import { SocialAccountField } from './fields/social-account-field'
import { PostOrAllField } from './fields/post-or-all-field'

function initialValuesFor(template: AutomationTemplateDefinition): TemplateFormValues {
  const initial: TemplateFormValues = {}
  for (const field of template.fields) {
    if (field.defaultValue !== undefined) initial[field.id] = field.defaultValue
    else if (field.type === 'switch') initial[field.id] = false
    else if (field.type === 'keywords') initial[field.id] = []
    else if (field.type === 'post_or_all') initial[field.id] = 'all'
    else initial[field.id] = ''
  }
  return initial
}

function isFieldVisible(field: TemplateField, values: TemplateFormValues): boolean {
  if (!field.showWhen) return true
  return values[field.showWhen.fieldId] === field.showWhen.equals
}

function isFormValid(template: AutomationTemplateDefinition, values: TemplateFormValues): boolean {
  for (const field of template.fields) {
    if (!isFieldVisible(field, values)) continue
    if (!field.required) continue
    const v = values[field.id]
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
  }
  return true
}

export function TemplateFormModal({
  open,
  template,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  template: AutomationTemplateDefinition | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<TemplateFormValues>(() =>
    template ? initialValuesFor(template) : {},
  )
  const [name, setName] = useState<string>(() =>
    template ? template.defaultName(values) : '',
  )
  const [isSaving, setIsSaving] = useState(false)

  const visibleFields = useMemo(
    () => (template ? template.fields.filter((f) => isFieldVisible(f, values)) : []),
    [template, values],
  )
  const valid = template ? isFormValid(template, values) && name.trim().length > 0 : false

  // Re-derive default name when key fields change.
  // (Keep it simple: only update if user hasn't manually edited yet.)
  const handleField = (id: string, next: unknown) => {
    setValues((prev) => ({ ...prev, [id]: next }))
  }

  const handleSave = async () => {
    if (!template || !valid) return
    setIsSaving(true)
    try {
      const graph = template.buildGraphFromForm(values)
      const triggerNode = graph.nodes.find((n) => n.data?.type?.startsWith('trigger_'))
      const config = triggerNode?.data?.config as Record<string, unknown> | undefined
      const body: Record<string, unknown> = {
        workflow_graph: graph,
        editor_version: 'canvas',
        name: name.trim(),
        is_active: false,
        social_account_id: config?.social_account_id || values.social_account_id || '',
      }
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save template')
      }
      toast({ title: 'Template saved', description: `"${name}" was saved as a draft.` })
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{template.name}</DialogTitle>
        <DialogDescription>{template.description}</DialogDescription>

        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-white/80">Automation name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/[0.04] text-white placeholder:text-white/30"
            />
          </div>

          {visibleFields.map((field) => {
            switch (field.type) {
              case 'social_account':
                return (
                  <SocialAccountField
                    key={field.id}
                    value={String(values[field.id] || '')}
                    onChange={(id) => handleField(field.id, id)}
                    platform={field.platform || 'instagram'}
                    label={field.label}
                    required={field.required}
                  />
                )
              case 'post_or_all':
                return (
                  <PostOrAllField
                    key={field.id}
                    socialAccountId={String(values.social_account_id || '')}
                    selection={String(values[field.id] || 'all')}
                    onChange={({ selection, postId }) => {
                      setValues((prev) => ({
                        ...prev,
                        [field.id]: selection,
                        post_id: postId,
                      }))
                    }}
                    label={field.label}
                    required={field.required}
                  />
                )
              case 'text':
              case 'url':
                return (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-sm font-semibold text-white/80">
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </Label>
                    <Input
                      value={String(values[field.id] || '')}
                      onChange={(e) => handleField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      type={field.type === 'url' ? 'url' : 'text'}
                      className="bg-white/[0.04] text-white placeholder:text-white/30"
                    />
                    {field.helpText && <p className="text-xs text-white/45">{field.helpText}</p>}
                  </div>
                )
              case 'textarea':
                return (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-sm font-semibold text-white/80">
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </Label>
                    <Textarea
                      value={String(values[field.id] || '')}
                      onChange={(e) => handleField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className="bg-white/[0.04] text-white placeholder:text-white/30 min-h-[88px]"
                    />
                  </div>
                )
              case 'switch':
                return (
                  <div key={field.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm font-semibold text-white/80">{field.label}</Label>
                      {field.helpText && (
                        <p className="text-xs text-white/45">{field.helpText}</p>
                      )}
                    </div>
                    <Switch
                      checked={Boolean(values[field.id])}
                      onCheckedChange={(checked) => handleField(field.id, checked)}
                    />
                  </div>
                )
              case 'tone':
                return (
                  <ToneField
                    key={field.id}
                    value={String(values[field.id] || 'friendly')}
                    onChange={(t) => handleField(field.id, t)}
                    label={field.label}
                  />
                )
              case 'keywords':
                return (
                  <KeywordsField
                    key={field.id}
                    value={Array.isArray(values[field.id]) ? (values[field.id] as string[]) : []}
                    onChange={(next) => handleField(field.id, next)}
                    label={field.label}
                    helpText={field.helpText}
                  />
                )
              default:
                return null
            }
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Draft'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add components/automation/templates/template-form-modal.tsx
git commit -m "Add schema-driven TemplateFormModal that compiles graphs from template forms"
```

---

## Task 13: Template gallery (the new default entry)

**Files:**
- Create: `components/automation/templates/template-gallery.tsx`

- [ ] **Step 1: Build the gallery**

```tsx
// components/automation/templates/template-gallery.tsx
"use client"

import { Sparkles, Workflow } from 'lucide-react'
import { AUTOMATION_TEMPLATES } from '@/lib/automation-templates'
import type { AutomationTemplateDefinition } from '@/lib/automation-templates'

const CATEGORY_ORDER: AutomationTemplateDefinition['category'][] = [
  'comments',
  'messages',
  'mentions',
  'growth',
]
const CATEGORY_LABEL: Record<AutomationTemplateDefinition['category'], string> = {
  comments: 'Comments',
  messages: 'Messages',
  mentions: 'Mentions',
  growth: 'Growth',
}

export function TemplateGallery({
  onPickTemplate,
  onAdvanced,
  disabled,
}: {
  onPickTemplate: (template: AutomationTemplateDefinition) => void
  onAdvanced: () => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white/85">Pick a template</h2>
          <p className="text-sm text-white/45">
            Each template is a single-screen setup. Saved automations start as drafts.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdvanced}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Workflow className="h-3.5 w-3.5" />
          Advanced canvas
        </button>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const templates = AUTOMATION_TEMPLATES.filter((t) => t.category === category)
        if (templates.length === 0) return null
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {CATEGORY_LABEL[category]}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const Icon = template.icon || Sparkles
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onPickTemplate(template)}
                    disabled={disabled}
                    className="flex flex-col items-start gap-2 rounded-xl bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-300/20">
                      <Icon className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/85">{template.name}</p>
                      <p className="mt-1 text-xs text-white/50">{template.description}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {template.supportedPlatforms.map((p) => (
                        <span
                          key={p}
                          className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add components/automation/templates/template-gallery.tsx
git commit -m "Add template gallery with categorized cards"
```

---

## Task 14: Wire gallery + form modal into the automation page

**Files:**
- Modify: `app/dashboard/automation/page.tsx`

- [ ] **Step 1: Imports + state**

At the top of the file (alongside existing imports), add:

```tsx
import { TemplateGallery } from "@/components/automation/templates/template-gallery"
import { TemplateFormModal } from "@/components/automation/templates/template-form-modal"
import type { AutomationTemplateDefinition } from "@/lib/automation-templates"
```

Add state (after the existing `useState` calls in the component, around line 51):

```tsx
const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplateDefinition | null>(null)
const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false)
```

- [ ] **Step 2: Repurpose the primary "New Automation" button to open the gallery**

The existing primary CTA (`handleCreateWizardGraph`, page.tsx:85-93 and 301-313) should be replaced for the top-of-page button: scroll/anchor to the gallery section instead. Keep `handleCreateWizardGraph` available for the "Advanced canvas/wizard" option in a secondary card.

Add a new handler:

```tsx
const handlePickTemplate = (template: AutomationTemplateDefinition) => {
  if (!canWriteAutomations) {
    showReadOnlyToast()
    return
  }
  setSelectedTemplate(template)
  setIsTemplateFormOpen(true)
}

const handleTemplateSaved = () => {
  setIsTemplateFormOpen(false)
  setSelectedTemplate(null)
  mutate()
}
```

- [ ] **Step 3: Replace the "Engagement Automations" section with the gallery**

In the list view (around page.tsx:319-367), replace the entire `Engagement Automations` block (the heading + permission notice + the two AutomationCard cards) with:

```tsx
<div>
  <div className="flex flex-col gap-1 mb-4">
    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
      Templates
    </h2>
    <p className="text-xs" style={{ color: AUTO_PAGE_THEME.muted }}>
      Quick-start your automation from a ready-made scenario. Each template saves as a draft you can refine later.
    </p>
  </div>

  <TemplateGallery
    onPickTemplate={handlePickTemplate}
    onAdvanced={handleCreateCanvas}
    disabled={!canWriteAutomations}
  />
</div>
```

Keep the "Advanced Visual Builder" section (page.tsx:369-397) unchanged — it remains a secondary path with the wizard / canvas / canvas-template-picker entry points. (The wizard entry remains available via `handleCreateWizardGraph`; users can still type free-form workflows.)

- [ ] **Step 4: Mount the modal**

Just above the closing `</div>` of the list view (next to `<AutomationTemplatePicker .../>` at page.tsx:549-553), mount the new modal:

```tsx
<TemplateFormModal
  open={isTemplateFormOpen && canWriteAutomations}
  template={selectedTemplate}
  onOpenChange={(open) => {
    setIsTemplateFormOpen(open)
    if (!open) setSelectedTemplate(null)
  }}
  onSaved={handleTemplateSaved}
/>
```

- [ ] **Step 5: Lint + build**

```bash
npm run lint
npm run build
```
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/automation/page.tsx
git commit -m "Make template gallery the default automation creation entry"
```

---

## Task 15: Manual smoke test (UI)

**No code changes.** Verify each template end-to-end before declaring the feature done.

- [ ] **Step 1: Boot the app**

```bash
npm run dev
```

- [ ] **Step 2: Walk through each of the 6 templates**

For each template card on `/dashboard/automation`:

1. Click the card.
2. Confirm the right fields render (and only those — `showWhen` should hide AI-only or message-only fields appropriately).
3. Pick an account; verify the post-or-all toggle reveals/hides the post selector.
4. Fill required fields; confirm Save Draft is disabled until they're set.
5. Save and confirm:
   - Toast appears: "Template saved".
   - The new automation appears in the Active Automations list with `is_active: false`.
   - Editing the saved automation opens the canvas and shows the expected nodes/edges.
6. Delete the test draft.

- [ ] **Step 3: Verify the existing canvas template picker still works**

Click "Automation Templates" in the Advanced Visual Builder section. The `AutomationTemplatePicker` modal should still open and present the 6 templates (now sourced from the new module). Selecting one should still seed the canvas.

- [ ] **Step 4: No commit (verification only)**

If all six templates passed, save a vault handoff:

```text
Title: Automation template gallery — Task 11 done
Project: Social-Media-Manager-AI-Tool
Type: handoff
Subject: Template gallery shipped (2026-05-07)
Summary: Default automation entry now uses a gallery of 6 engagement templates...
```

If any template failed, do **not** mark Task 11 done. Re-open the relevant template task and fix the field schema or `buildGraphFromForm` shape, then re-verify.

---

## Self-review notes (already applied)

- **Spec coverage:** Tasks 3-8 cover all six engagement templates from the handoff; Daily AI Post (#7) is explicitly deferred with reasoning.
- **No placeholders:** Every step contains the actual code or the actual command.
- **Type consistency:** `AutomationTemplateDefinition` (Task 1) is the type used by every template in Tasks 3-8 and consumed in Task 12. `TemplateFormValues` is used consistently. `buildGraphFromForm` signature matches across all definitions.
- **Pre-existing tone enum** in `lib/automation-wizard/types.ts:31` matched in Task 10.
- **Pre-existing trigger/action types** in `types/automation-graph.ts:6-66` matched in every template body.
- **Re-export shim** keeps `components/automation/automation-template-picker.tsx` working without modification.
