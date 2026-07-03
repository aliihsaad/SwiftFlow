# AI Assistant Command Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the AI Assistant into a visible mode-based, mobile-friendly command-center shell while preserving the existing content, image, carousel, brand-image, chat history, and post handoff flows.

**Architecture:** Phase 1 keeps the current `/api/assistant/invoke` gateway and existing Supabase Edge Functions. It adds a small pure intent-router layer, typed assistant UI contracts, visible mode chips, and extracted UI components around the existing flow handlers. Write actions are not expanded in Phase 1; this phase prepares the UI and logic boundaries for context packs and confirmations in later phases.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, existing shadcn/ui components, Vitest, existing assistant Edge Functions.

---

## Scope

Phase 1 implements the shell and routing foundation only:

1. Split assistant types/config/router out of the large `chat-interface.tsx`.
2. Add visible modes: `create`, `improve`, `analyze`, `operate`, `ask`.
3. Route submits through a deterministic intent router before choosing the target function.
4. Replace hidden `activeFunction` UX with visible mode/action state.
5. Refactor the empty state, mode switcher, composer, and history controls into focused components.
6. Improve mobile layout with a single-column shell, horizontal mode chips, and a sticky composer.
7. Preserve existing generation flows and chat sessions.

Phase 1 does not add the new `/api/assistant/command` route or write-action confirmations. Those belong to Phase 2 and Phase 3 from the design spec.

## File Structure

Create:

1. `app/dashboard/assistant/assistant-types.ts`
   - Shared UI/domain types for assistant modes, actions, messages, cards, image attachments, and flow state.

2. `app/dashboard/assistant/assistant-config.ts`
   - Mode metadata, quick-start definitions, and theme tokens currently embedded in `chat-interface.tsx`.

3. `lib/assistant/intent-router.ts`
   - Pure deterministic router used by the client to map input text plus selected mode into an assistant action/function target.

4. `tests/developer-api/assistant-intent-router.test.ts`
   - Vitest coverage for the router. This location is used because the current Vitest include pattern covers `tests/developer-api/**/*.test.ts`.

5. `app/dashboard/assistant/components/command-center/mode-switcher.tsx`
   - Responsive mode chips for desktop and mobile.

6. `app/dashboard/assistant/components/command-center/empty-state.tsx`
   - Practical quick-start empty state.

7. `app/dashboard/assistant/components/command-center/composer.tsx`
   - Sticky input, attachments preview, visible mode chip, send button.

8. `app/dashboard/assistant/components/command-center/history-controls.tsx`
   - Chat history and new-chat controls extracted from the toolbar.

9. `app/dashboard/assistant/components/command-center/loading-bubble.tsx`
   - Assistant loading indicator extracted from the message list.

Modify:

1. `app/dashboard/assistant/chat-interface.tsx`
   - Keep orchestration and existing handlers, but delegate UI pieces to new components and replace `activeFunction` with visible mode/action routing.

2. `vitest.config.ts`
   - No change in Phase 1. Tests stay under `tests/developer-api`.

## Task 1: Add Assistant Types and Config

**Files:**
- Create: `app/dashboard/assistant/assistant-types.ts`
- Create: `app/dashboard/assistant/assistant-config.ts`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Create the shared assistant types file**

Create `app/dashboard/assistant/assistant-types.ts` with this content:

```ts
import type { LucideIcon } from 'lucide-react'

export type AssistantMode = 'create' | 'improve' | 'analyze' | 'operate' | 'ask'

export type AssistantAction =
  | 'generate_ideas'
  | 'generate_caption'
  | 'generate_image'
  | 'generate_carousel'
  | 'brand_images'
  | 'improve_text'
  | 'analyze_workspace'
  | 'inspect_posts'
  | 'inspect_automations'
  | 'general_chat'

export type AssistantFunctionName =
  | 'chat-assistant'
  | 'generate-image'
  | 'generate-ideas'
  | 'generate-carousel'

export type AssistantConfidence = 'high' | 'medium' | 'low'

export interface AssistantIntent {
  mode: AssistantMode
  action: AssistantAction
  functionName: AssistantFunctionName
  confidence: AssistantConfidence
  needsClarification: boolean
}

export interface MessageImage {
  base64: string
  mimeType: string
  name: string
}

export type AssistantMessageType =
  | 'text'
  | 'content_cards'
  | 'carousel_slides'
  | 'image'
  | 'style_selector'
  | 'carousel_style_selector'
  | 'idea_options_selector'
  | 'brand_image_mode_selector'
  | 'brand_image_options'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  type?: AssistantMessageType
  data?: unknown
  images?: MessageImage[]
}

export type AssistantFlowState =
  | 'idle'
  | 'awaiting_description'
  | 'awaiting_style'
  | 'awaiting_carousel_topic'
  | 'awaiting_carousel_style'
  | 'awaiting_idea_options'
  | 'awaiting_brand_image_mode'
  | 'awaiting_brand_image_upload'
  | 'awaiting_brand_image_options'

export interface AssistantModeMeta {
  id: AssistantMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export interface AssistantQuickStart {
  id: string
  mode: AssistantMode
  action: AssistantAction
  title: string
  description: string
  prompt: string
  functionName: AssistantFunctionName | 'brand-images'
  icon: LucideIcon
}
```

- [ ] **Step 2: Create assistant config**

Create `app/dashboard/assistant/assistant-config.ts` with this content:

```ts
import {
  BarChart3,
  Bot,
  CalendarDays,
  Image as ImageIcon,
  Images,
  Lightbulb,
  MessageSquareText,
  Paintbrush,
  PenLine,
  Settings2,
} from 'lucide-react'
import type { AssistantModeMeta, AssistantQuickStart } from './assistant-types'

export const ASSISTANT_THEME = {
  shell: '#151620',
  shellAlt: '#1b1d28',
  bubble: '#1b1d28',
  border: 'rgba(255,255,255,0.08)',
  borderSoft: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.85)',
  textMuted: 'rgba(255,255,255,0.5)',
  textDim: 'rgba(255,255,255,0.35)',
  cyan: '#38bdf8',
  cyanSoft: '#dff6ff',
  coral: '#fb7185',
  amber: '#fbbf24',
}

export const ASSISTANT_MODES: AssistantModeMeta[] = [
  {
    id: 'create',
    label: 'Create',
    shortLabel: 'Create',
    description: 'Ideas, captions, images, carousels, and drafts.',
    icon: PenLine,
  },
  {
    id: 'improve',
    label: 'Improve',
    shortLabel: 'Improve',
    description: 'Rewrite, shorten, expand, adjust tone, and add CTAs.',
    icon: MessageSquareText,
  },
  {
    id: 'analyze',
    label: 'Analyze',
    shortLabel: 'Analyze',
    description: 'Understand performance, timing, formats, and topics.',
    icon: BarChart3,
  },
  {
    id: 'operate',
    label: 'Operate',
    shortLabel: 'Operate',
    description: 'Inspect posts, schedules, automations, and setup.',
    icon: Settings2,
  },
  {
    id: 'ask',
    label: 'Ask',
    shortLabel: 'Ask',
    description: 'General chat and product help.',
    icon: Bot,
  },
]

export const ASSISTANT_QUICK_STARTS: AssistantQuickStart[] = [
  {
    id: 'create-post',
    mode: 'create',
    action: 'generate_caption',
    title: 'Create post',
    description: 'Draft a post from an idea or topic.',
    prompt: 'Create a social media post about ',
    functionName: 'chat-assistant',
    icon: PenLine,
  },
  {
    id: 'generate-ideas',
    mode: 'create',
    action: 'generate_ideas',
    title: 'Generate ideas',
    description: 'Get content ideas for your brand.',
    prompt: 'Generate content ideas for my brand.',
    functionName: 'generate-ideas',
    icon: Lightbulb,
  },
  {
    id: 'create-image',
    mode: 'create',
    action: 'generate_image',
    title: 'Create image',
    description: 'Generate post-ready visual concepts.',
    prompt: '',
    functionName: 'generate-image',
    icon: ImageIcon,
  },
  {
    id: 'create-carousel',
    mode: 'create',
    action: 'generate_carousel',
    title: 'Create carousel',
    description: 'Build a multi-slide post.',
    prompt: '',
    functionName: 'generate-carousel',
    icon: Images,
  },
  {
    id: 'brand-images',
    mode: 'create',
    action: 'brand_images',
    title: 'Brand images',
    description: 'Generate or transform branded images.',
    prompt: '',
    functionName: 'brand-images',
    icon: Paintbrush,
  },
  {
    id: 'improve-draft',
    mode: 'improve',
    action: 'improve_text',
    title: 'Improve draft',
    description: 'Rewrite a caption or sharpen a hook.',
    prompt: 'Improve this draft: ',
    functionName: 'chat-assistant',
    icon: MessageSquareText,
  },
  {
    id: 'analyze-performance',
    mode: 'analyze',
    action: 'analyze_workspace',
    title: 'Analyze performance',
    description: 'Find what is working and what to post next.',
    prompt: 'Analyze my recent performance and suggest what to post next.',
    functionName: 'chat-assistant',
    icon: BarChart3,
  },
  {
    id: 'plan-week',
    mode: 'create',
    action: 'generate_ideas',
    title: 'Plan week',
    description: 'Create a practical weekly content plan.',
    prompt: 'Plan a week of social media posts for my brand.',
    functionName: 'chat-assistant',
    icon: CalendarDays,
  },
  {
    id: 'manage-automations',
    mode: 'operate',
    action: 'inspect_automations',
    title: 'Manage automations',
    description: 'Review automation setup and next actions.',
    prompt: 'Help me review my active automations.',
    functionName: 'chat-assistant',
    icon: Settings2,
  },
]
```

- [ ] **Step 3: Update imports in `chat-interface.tsx`**

Replace the local `MessageImage`, `Message`, and `ACTION_CARDS` definitions in `app/dashboard/assistant/chat-interface.tsx` with imports:

```ts
import type {
  AssistantFlowState,
  AssistantFunctionName,
  AssistantMessage,
  AssistantMode,
  AssistantQuickStart,
  MessageImage,
} from './assistant-types'
import {
  ASSISTANT_MODES,
  ASSISTANT_QUICK_STARTS,
  ASSISTANT_THEME,
} from './assistant-config'
```

Then update local state types:

```ts
const [messages, setMessages] = useState<AssistantMessage[]>([])
const [selectedMode, setSelectedMode] = useState<AssistantMode>('create')
const [lastFunctionName, setLastFunctionName] = useState<AssistantFunctionName>('chat-assistant')
const [flowState, setFlowState] = useState<AssistantFlowState>('idle')
```

- [ ] **Step 4: Run TypeScript through build to identify import-only errors**

Run:

```bash
pnpm build
```

Expected result at this point:

```text
Build may fail with references to Message or ACTION_CARDS until later tasks finish the component refactor.
```

Do not commit Task 1 until Task 4 is resolved by Task 3 and Task 4 below.

## Task 2: Add Deterministic Intent Router

**Files:**
- Create: `lib/assistant/intent-router.ts`
- Create: `tests/developer-api/assistant-intent-router.test.ts`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Write failing router tests**

Create `tests/developer-api/assistant-intent-router.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { routeAssistantIntent } from '@/lib/assistant/intent-router'

describe('routeAssistantIntent', () => {
  it('keeps explicit create image requests on generate-image', () => {
    expect(routeAssistantIntent({
      message: 'create an image for my post',
      selectedMode: 'create',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_image',
      functionName: 'generate-image',
      confidence: 'high',
      needsClarification: false,
    })
  })

  it('routes carousel requests to generate-carousel', () => {
    expect(routeAssistantIntent({
      message: 'make a 5 slide carousel about AI automation',
      selectedMode: 'create',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_carousel',
      functionName: 'generate-carousel',
    })
  })

  it('routes idea requests to generate-ideas', () => {
    expect(routeAssistantIntent({
      message: 'give me ten content ideas',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'create',
      action: 'generate_ideas',
      functionName: 'generate-ideas',
    })
  })

  it('keeps improve mode visible for rewrite requests', () => {
    expect(routeAssistantIntent({
      message: 'rewrite this caption to be shorter',
      selectedMode: 'improve',
    })).toMatchObject({
      mode: 'improve',
      action: 'improve_text',
      functionName: 'chat-assistant',
    })
  })

  it('routes analytics questions to analyze mode', () => {
    expect(routeAssistantIntent({
      message: 'analyze my best posts this month',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'analyze',
      action: 'analyze_workspace',
      functionName: 'chat-assistant',
    })
  })

  it('routes automation management to operate mode', () => {
    expect(routeAssistantIntent({
      message: 'show my active automations',
      selectedMode: 'ask',
    })).toMatchObject({
      mode: 'operate',
      action: 'inspect_automations',
      functionName: 'chat-assistant',
    })
  })

  it('uses selected mode for ambiguous short input', () => {
    expect(routeAssistantIntent({
      message: 'help me',
      selectedMode: 'operate',
    })).toMatchObject({
      mode: 'operate',
      action: 'general_chat',
      functionName: 'chat-assistant',
      confidence: 'low',
      needsClarification: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-intent-router.test.ts
```

Expected:

```text
FAIL Cannot find module '@/lib/assistant/intent-router'
```

- [ ] **Step 3: Implement the router**

Create `lib/assistant/intent-router.ts`:

```ts
import type {
  AssistantAction,
  AssistantFunctionName,
  AssistantIntent,
  AssistantMode,
} from '@/app/dashboard/assistant/assistant-types'

interface RouteAssistantIntentInput {
  message: string
  selectedMode: AssistantMode
  overrideFunctionName?: AssistantFunctionName | 'brand-images'
}

const IMAGE_WORDS = /\b(image|photo|picture|visual|graphic|thumbnail|cover)\b/i
const CAROUSEL_WORDS = /\b(carousel|slides?|slide deck)\b/i
const IDEA_WORDS = /\b(ideas?|topics?|hooks?|angles?)\b/i
const IMPROVE_WORDS = /\b(rewrite|improve|shorten|expand|tone|cta|hook|refine|better)\b/i
const ANALYZE_WORDS = /\b(analy[sz]e|analytics|performance|best posts?|views?|likes?|comments?|followers?|hashtags?|time)\b/i
const AUTOMATION_WORDS = /\b(automation|automations|workflow|trigger|dm reply|comment reply|active automations?)\b/i
const POST_WORDS = /\b(drafts?|scheduled posts?|schedule|post now|calendar)\b/i

function fallbackActionForMode(mode: AssistantMode): AssistantAction {
  switch (mode) {
    case 'create':
      return 'generate_caption'
    case 'improve':
      return 'improve_text'
    case 'analyze':
      return 'analyze_workspace'
    case 'operate':
      return 'general_chat'
    case 'ask':
    default:
      return 'general_chat'
  }
}

function functionForAction(action: AssistantAction): AssistantFunctionName {
  switch (action) {
    case 'generate_ideas':
      return 'generate-ideas'
    case 'generate_image':
      return 'generate-image'
    case 'generate_carousel':
      return 'generate-carousel'
    default:
      return 'chat-assistant'
  }
}

export function routeAssistantIntent(input: RouteAssistantIntentInput): AssistantIntent {
  const message = input.message.trim()
  const selectedMode = input.selectedMode || 'ask'

  if (input.overrideFunctionName === 'generate-image') {
    return {
      mode: 'create',
      action: 'generate_image',
      functionName: 'generate-image',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (input.overrideFunctionName === 'generate-carousel') {
    return {
      mode: 'create',
      action: 'generate_carousel',
      functionName: 'generate-carousel',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (input.overrideFunctionName === 'generate-ideas') {
    return {
      mode: 'create',
      action: 'generate_ideas',
      functionName: 'generate-ideas',
      confidence: 'high',
      needsClarification: false,
    }
  }

  if (CAROUSEL_WORDS.test(message)) {
    return { mode: 'create', action: 'generate_carousel', functionName: 'generate-carousel', confidence: 'high', needsClarification: false }
  }

  if (IMAGE_WORDS.test(message) && /\b(create|generate|make|design)\b/i.test(message)) {
    return { mode: 'create', action: 'generate_image', functionName: 'generate-image', confidence: 'high', needsClarification: false }
  }

  if (IDEA_WORDS.test(message) && /\b(generate|give|suggest|need|content)\b/i.test(message)) {
    return { mode: 'create', action: 'generate_ideas', functionName: 'generate-ideas', confidence: 'high', needsClarification: false }
  }

  if (IMPROVE_WORDS.test(message)) {
    return { mode: 'improve', action: 'improve_text', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (ANALYZE_WORDS.test(message)) {
    return { mode: 'analyze', action: 'analyze_workspace', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (AUTOMATION_WORDS.test(message)) {
    return { mode: 'operate', action: 'inspect_automations', functionName: 'chat-assistant', confidence: 'high', needsClarification: false }
  }

  if (POST_WORDS.test(message)) {
    return { mode: 'operate', action: 'inspect_posts', functionName: 'chat-assistant', confidence: 'medium', needsClarification: false }
  }

  const action = fallbackActionForMode(selectedMode)
  return {
    mode: selectedMode,
    action,
    functionName: functionForAction(action),
    confidence: message.length < 18 ? 'low' : 'medium',
    needsClarification: message.length < 18 && selectedMode !== 'ask',
  }
}
```

- [ ] **Step 4: Run router tests**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-intent-router.test.ts
```

Expected:

```text
PASS tests/developer-api/assistant-intent-router.test.ts
```

- [ ] **Step 5: Commit router types and tests**

Run:

```bash
git add app/dashboard/assistant/assistant-types.ts app/dashboard/assistant/assistant-config.ts lib/assistant/intent-router.ts tests/developer-api/assistant-intent-router.test.ts
git commit -m "Add assistant intent routing foundation"
```

## Task 3: Extract Mode Switcher and Empty State

**Files:**
- Create: `app/dashboard/assistant/components/command-center/mode-switcher.tsx`
- Create: `app/dashboard/assistant/components/command-center/empty-state.tsx`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Create mode switcher component**

Create `app/dashboard/assistant/components/command-center/mode-switcher.tsx`:

```tsx
'use client'

import type { AssistantMode } from '../../assistant-types'
import type { AssistantModeMeta } from '../../assistant-types'
import { cn } from '@/lib/utils'

interface AssistantModeSwitcherProps {
  modes: AssistantModeMeta[]
  selectedMode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  compact?: boolean
}

export function AssistantModeSwitcher({
  modes,
  selectedMode,
  onModeChange,
  compact = false,
}: AssistantModeSwitcherProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {modes.map((mode) => {
        const Icon = mode.icon
        const active = selectedMode === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onModeChange(mode.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
              active
                ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100'
                : 'border-white/8 bg-white/5 text-white/55 hover:bg-white/8 hover:text-white/80',
            )}
            title={mode.description}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{compact ? mode.shortLabel : mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create empty state component**

Create `app/dashboard/assistant/components/command-center/empty-state.tsx`:

```tsx
'use client'

import { Bot } from 'lucide-react'
import type { AssistantQuickStart } from '../../assistant-types'

interface AssistantEmptyStateProps {
  quickStarts: AssistantQuickStart[]
  onQuickStart: (quickStart: AssistantQuickStart) => void
}

export function AssistantEmptyState({ quickStarts, onQuickStart }: AssistantEmptyStateProps) {
  return (
    <div className="flex min-h-[58vh] flex-col items-center justify-center gap-8 px-2 py-8 animate-in fade-in zoom-in duration-500">
      <div className="space-y-3 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-rose-400 shadow-[0_0_40px_rgba(56,189,248,0.22)]">
          <Bot className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-normal text-white/90 sm:text-3xl">
          AI Command Center
        </h1>
        <p className="max-w-md text-sm text-white/45 sm:text-base">
          Create, improve, analyze, and operate your social media workspace from one focused assistant.
        </p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {quickStarts.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onQuickStart(item)}
              className="group flex min-h-[82px] items-center gap-3 rounded-lg border border-white/8 bg-[#1b1d28] p-3 text-left transition-colors hover:border-cyan-400/25 hover:bg-white/6"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white/85">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-white/38">{item.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire components into `chat-interface.tsx`**

Add imports:

```ts
import { AssistantModeSwitcher } from './components/command-center/mode-switcher'
import { AssistantEmptyState } from './components/command-center/empty-state'
```

Replace the current empty-state JSX with:

```tsx
{messages.length === 0 && (
  <AssistantEmptyState
    quickStarts={ASSISTANT_QUICK_STARTS}
    onQuickStart={handleQuickStart}
  />
)}
```

Add mode chips below the toolbar:

```tsx
<div className="flex-none border-b border-white/6 px-3 py-2 sm:px-5">
  <div className="mx-auto max-w-4xl">
    <AssistantModeSwitcher
      modes={ASSISTANT_MODES}
      selectedMode={selectedMode}
      onModeChange={setSelectedMode}
      compact
    />
  </div>
</div>
```

- [ ] **Step 4: Replace `handleCardClick` with `handleQuickStart`**

In `chat-interface.tsx`, rename `handleCardClick` to:

```ts
const handleQuickStart = (quickStart: AssistantQuickStart) => {
  setSelectedMode(quickStart.mode)
  setLastFunctionName(
    quickStart.functionName === 'brand-images'
      ? 'chat-assistant'
      : quickStart.functionName,
  )

  if (quickStart.functionName === 'generate-image') {
    setFlowState('awaiting_description')
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'What do you want the image to be about?',
    }])
    return
  }

  if (quickStart.functionName === 'generate-carousel') {
    setFlowState('awaiting_carousel_topic')
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "What topic do you want the carousel to be about? Share any specific tips or points, or I can generate them.",
    }])
    return
  }

  if (quickStart.functionName === 'brand-images') {
    setFlowState('awaiting_brand_image_mode')
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'What would you like to do with brand images?',
      type: 'brand_image_mode_selector',
    }])
    return
  }

  if (quickStart.functionName === 'generate-ideas') {
    setFlowState('awaiting_idea_options')
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "Let's generate content ideas. Choose your source and how many ideas you need:",
      type: 'idea_options_selector',
    }])
    return
  }

  if (quickStart.prompt.endsWith(' ')) {
    setInput(quickStart.prompt)
    return
  }

  handleSend(quickStart.prompt, quickStart.functionName)
}
```

- [ ] **Step 5: Run lint for extracted components**

Run:

```bash
pnpm exec eslint app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/mode-switcher.tsx app/dashboard/assistant/components/command-center/empty-state.tsx
```

Expected:

```text
No new errors.
```

- [ ] **Step 6: Commit extracted mode and empty state components**

Run:

```bash
git add app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/mode-switcher.tsx app/dashboard/assistant/components/command-center/empty-state.tsx
git commit -m "Refine assistant mode shell"
```

## Task 4: Add Intent Routing to Submit Flow

**Files:**
- Modify: `app/dashboard/assistant/chat-interface.tsx`
- Test: `tests/developer-api/assistant-intent-router.test.ts`

- [ ] **Step 1: Import router**

In `chat-interface.tsx`, add:

```ts
import { routeAssistantIntent } from '@/lib/assistant/intent-router'
```

- [ ] **Step 2: Replace target function resolution inside `handleSend`**

Find:

```ts
const targetFunction = overrideFunction || activeFunction || "chat-assistant"
```

Replace with:

```ts
const routedIntent = routeAssistantIntent({
  message: messageText,
  selectedMode,
  overrideFunctionName: overrideFunction as AssistantFunctionName | undefined,
})

setSelectedMode(routedIntent.mode)
setLastFunctionName(routedIntent.functionName)

const targetFunction = routedIntent.functionName
```

- [ ] **Step 3: Include routed intent in assistant payload**

Find the `invokeEdge(targetFunction, { ... })` payload and include:

```ts
assistantIntent: {
  mode: routedIntent.mode,
  action: routedIntent.action,
  confidence: routedIntent.confidence,
},
```

The full payload block should become:

```ts
const data = await invokeEdge(targetFunction, {
  messages: newMessages,
  workspaceId,
  prompt: messageText,
  assistantIntent: {
    mode: routedIntent.mode,
    action: routedIntent.action,
    confidence: routedIntent.confidence,
  },
  ...extraPayload,
}) as any
```

- [ ] **Step 4: Replace placeholder text**

Replace:

```tsx
placeholder={activeFunction !== 'chat-assistant' ? `Using ${activeFunction}…` : "Ask me anything…"}
```

With:

```tsx
placeholder={
  selectedMode === 'create'
    ? 'Create a post, image, carousel, or idea...'
    : selectedMode === 'improve'
      ? 'Paste a draft to improve...'
      : selectedMode === 'analyze'
        ? 'Ask about performance or timing...'
        : selectedMode === 'operate'
          ? 'Ask about posts, schedules, or automations...'
          : 'Ask me anything...'
}
```

- [ ] **Step 5: Remove `activeFunction` state**

Remove:

```ts
const [activeFunction, setActiveFunction] = useState<string>("chat-assistant")
```

Ensure all previous `setActiveFunction("chat-assistant")` calls become:

```ts
setSelectedMode('create')
setLastFunctionName('chat-assistant')
```

- [ ] **Step 6: Run router and assistant lint checks**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-intent-router.test.ts
pnpm exec eslint app/dashboard/assistant/chat-interface.tsx lib/assistant/intent-router.ts tests/developer-api/assistant-intent-router.test.ts
```

Expected:

```text
Router tests pass.
ESLint reports no new errors.
```

- [ ] **Step 7: Commit routed submit flow**

Run:

```bash
git add app/dashboard/assistant/chat-interface.tsx lib/assistant/intent-router.ts tests/developer-api/assistant-intent-router.test.ts
git commit -m "Route assistant submits through visible modes"
```

## Task 5: Extract Composer and Loading Bubble

**Files:**
- Create: `app/dashboard/assistant/components/command-center/composer.tsx`
- Create: `app/dashboard/assistant/components/command-center/loading-bubble.tsx`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Create loading bubble**

Create `app/dashboard/assistant/components/command-center/loading-bubble.tsx`:

```tsx
'use client'

import { Bot } from 'lucide-react'
import { ASSISTANT_THEME } from '../../assistant-config'

export function AssistantLoadingBubble() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-rose-400">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div
        className="flex items-center gap-1.5 rounded-2xl px-4 py-3"
        style={{
          background: ASSISTANT_THEME.shellAlt,
          border: `1px solid ${ASSISTANT_THEME.borderSoft}`,
          borderBottomLeftRadius: '4px',
        }}
      >
        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: ASSISTANT_THEME.cyan }} />
        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: ASSISTANT_THEME.coral }} />
        <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: ASSISTANT_THEME.amber }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create composer**

Create `app/dashboard/assistant/components/command-center/composer.tsx`:

```tsx
'use client'

import { Paperclip, X, ArrowUp } from 'lucide-react'
import type { RefObject } from 'react'
import type { AssistantMode, MessageImage } from '../../assistant-types'
import { ASSISTANT_THEME } from '../../assistant-config'

interface AssistantComposerProps {
  input: string
  selectedMode: AssistantMode
  pendingImages: MessageImage[]
  isLoading: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onInputChange: (value: string) => void
  onSend: () => void
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: (index: number) => void
}

function placeholderForMode(mode: AssistantMode): string {
  switch (mode) {
    case 'create':
      return 'Create a post, image, carousel, or idea...'
    case 'improve':
      return 'Paste a draft to improve...'
    case 'analyze':
      return 'Ask about performance or timing...'
    case 'operate':
      return 'Ask about posts, schedules, or automations...'
    case 'ask':
    default:
      return 'Ask me anything...'
  }
}

export function AssistantComposer({
  input,
  selectedMode,
  pendingImages,
  isLoading,
  fileInputRef,
  onInputChange,
  onSend,
  onFileSelect,
  onRemoveImage,
}: AssistantComposerProps) {
  return (
    <div className="flex-none border-t border-white/6 bg-[#151620]/90 p-3 backdrop-blur sm:p-4">
      <div className="mx-auto max-w-3xl">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex gap-2 px-1">
            {pendingImages.map((img, index) => (
              <div key={`${img.name}-${index}`} className="group relative">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.name}
                  className="h-14 w-14 rounded-lg border border-white/10 object-cover sm:h-16 sm:w-16"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-cyan-100">
            {selectedMode}
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || pendingImages.length >= 3}
            className="absolute left-2 flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 disabled:opacity-30"
            title="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) onSend()
            }}
            placeholder={placeholderForMode(selectedMode)}
            className="w-full rounded-xl py-3.5 pl-11 pr-14 text-sm text-white/85 outline-none transition-colors"
            style={{
              background: ASSISTANT_THEME.shellAlt,
              border: `1px solid ${ASSISTANT_THEME.border}`,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
            className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-rose-400 transition-opacity active:scale-95 disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/25">
          AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire extracted components**

In `chat-interface.tsx`, add imports:

```ts
import { AssistantComposer } from './components/command-center/composer'
import { AssistantLoadingBubble } from './components/command-center/loading-bubble'
```

Replace the current loading dots block with:

```tsx
{isLoading && <AssistantLoadingBubble />}
```

Replace the entire composer JSX block with:

```tsx
<AssistantComposer
  input={input}
  selectedMode={selectedMode}
  pendingImages={pendingImages}
  isLoading={isLoading}
  fileInputRef={fileInputRef}
  onInputChange={setInput}
  onSend={() => handleSend()}
  onFileSelect={handleFileSelect}
  onRemoveImage={(index) => setPendingImages(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
/>
```

- [ ] **Step 4: Remove unused icons from `chat-interface.tsx`**

After extracting composer and loading bubble, remove unused imports from `lucide-react`:

```ts
Send,
Paperclip,
X,
ArrowUp,
```

Run lint in Step 5 to catch the exact unused imports.

- [ ] **Step 5: Run lint**

Run:

```bash
pnpm exec eslint app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/composer.tsx app/dashboard/assistant/components/command-center/loading-bubble.tsx
```

Expected:

```text
No new errors. Existing no-img-element warnings are acceptable only if they already existed in this assistant surface.
```

- [ ] **Step 6: Commit composer extraction**

Run:

```bash
git add app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/composer.tsx app/dashboard/assistant/components/command-center/loading-bubble.tsx
git commit -m "Extract assistant composer"
```

## Task 6: Extract History Controls and Tighten Mobile Shell

**Files:**
- Create: `app/dashboard/assistant/components/command-center/history-controls.tsx`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Create history controls component**

Create `app/dashboard/assistant/components/command-center/history-controls.tsx`:

```tsx
'use client'

import { RefreshCw, History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AssistantSessionSummary {
  id: string
  title: string
}

interface AssistantHistoryControlsProps {
  sessions: AssistantSessionSummary[]
  sessionId: string | null
  onLoadSession: (id: string) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
}

export function AssistantHistoryControls({
  sessions,
  sessionId,
  onLoadSession,
  onNewChat,
  onDeleteSession,
}: AssistantHistoryControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
            title="Chat history"
            type="button"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] border-white/10 bg-[#151620] text-white/85 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-white/90">Chat History</DialogTitle>
            <DialogDescription className="text-white/50">
              Resume a previous conversation or start clean.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
              onClick={onNewChat}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              New chat
            </Button>
          </div>
          <ScrollArea className="h-[min(52vh,360px)] pr-3">
            <div className="space-y-1.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border px-2 py-1.5"
                  style={{
                    background: session.id === sessionId ? 'rgba(56,189,248,0.12)' : 'transparent',
                    borderColor: session.id === sessionId ? 'rgba(56,189,248,0.18)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onLoadSession(session.id)}
                    className="min-w-0 flex-1 truncate px-2 text-left text-sm text-white/70"
                  >
                    {session.title || 'Untitled Chat'}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/35 hover:bg-red-500/10 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-white/10 bg-[#1b1d28] text-white/85">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete this chat?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/50">
                          This removes the saved conversation history.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteSession(session.id)}
                          className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="py-10 text-center text-sm text-white/25">
                  No chat history yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
        onClick={onNewChat}
        title="New chat"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire history controls**

Add import:

```ts
import { AssistantHistoryControls } from './components/command-center/history-controls'
```

Add helper:

```ts
const handleNewChat = () => {
  loadSession('new')
  setSelectedMode('create')
  setLastFunctionName('chat-assistant')
  toast({ title: 'New Chat Started', duration: 1000 })
}
```

Replace the toolbar history/new-chat JSX with:

```tsx
<AssistantHistoryControls
  sessions={sessions}
  sessionId={sessionId}
  onLoadSession={loadSession}
  onNewChat={handleNewChat}
  onDeleteSession={handleDeleteSession}
/>
```

- [ ] **Step 3: Tighten shell sizing**

Change the root shell class from:

```tsx
className="flex flex-col h-[calc(100vh-8.5rem)] max-w-6xl mx-auto w-full overflow-hidden rounded-2xl"
```

To:

```tsx
className="mx-auto flex h-[calc(100vh-7.75rem)] w-full max-w-6xl flex-col overflow-hidden rounded-none sm:h-[calc(100vh-8.5rem)] sm:rounded-xl"
```

This makes the assistant use the available width on mobile while keeping the desktop framed look.

- [ ] **Step 4: Run lint and build**

Run:

```bash
pnpm exec eslint app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/history-controls.tsx
pnpm build
```

Expected:

```text
Build passes.
No new lint errors.
```

- [ ] **Step 5: Commit history/mobile shell extraction**

Run:

```bash
git add app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/history-controls.tsx
git commit -m "Improve assistant history and mobile shell"
```

## Task 7: Preserve Flow Behavior and Add Regression Notes

**Files:**
- Modify: `app/dashboard/assistant/chat-interface.tsx`
- Modify: `docs/superpowers/plans/2026-05-15-ai-assistant-command-center-phase-1.md`

- [ ] **Step 1: Verify quick-start flow mappings manually in code**

Confirm these mappings exist in `handleQuickStart`:

```ts
generate-image -> flowState 'awaiting_description'
generate-carousel -> flowState 'awaiting_carousel_topic'
brand-images -> flowState 'awaiting_brand_image_mode'
generate-ideas -> flowState 'awaiting_idea_options'
```

Confirm direct chat-like quick starts call:

```ts
handleSend(quickStart.prompt, quickStart.functionName)
```

- [ ] **Step 2: Verify existing flow handlers still call existing functions**

Confirm:

```ts
handleStyleSelect -> handleSend(..., 'generate-image')
handleCarouselGenerate -> handleSend(..., 'generate-carousel')
handleIdeaGenerate -> handleSend(..., 'generate-ideas')
handleBrandImageGenerate -> invokeEdge('generate-image', ...)
```

- [ ] **Step 3: Run focused test suite**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-intent-router.test.ts
pnpm test:ci tests/developer-api
```

Expected:

```text
All tests pass.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm test:ci
pnpm build
```

Expected:

```text
All Vitest tests pass.
Production build passes.
```

- [ ] **Step 5: Run browser smoke test**

Start the dev server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000/dashboard/assistant
```

Verify desktop:

1. Mode chips are visible.
2. Empty-state cards render without overlap.
3. New chat and history controls work.
4. Typing "give me content ideas" routes to ideas behavior.
5. Typing "create an image for..." routes to image flow.

Verify mobile viewport:

1. Root shell uses full mobile width.
2. Mode chips are horizontally usable.
3. Composer stays reachable.
4. Quick-start cards stack cleanly.
5. Attached-image strip does not overlap the input.

- [ ] **Step 6: Commit verification fixes**

If verification required any fixes, commit only those files:

```bash
git add app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center
git commit -m "Polish assistant phase one shell"
```

If no fixes were needed, do not create an empty commit.

## Task 8: Final Push and Handoff

**Files:**
- Read: `git status --short`
- Read: `git log --oneline origin/master..HEAD`

- [ ] **Step 1: Confirm only intended files changed**

Run:

```bash
git status --short
```

Expected:

```text
Only assistant Phase 1 files are staged or modified by this work. Pre-existing unrelated dirty files remain unstaged.
```

- [ ] **Step 2: Push to master**

Run:

```bash
git push origin HEAD:master
```

Expected:

```text
HEAD -> master
```

- [ ] **Step 3: Save Vault memory**

Save a Vault memory with:

```json
{
  "project": "Social-Media-Manager-AI-Tool",
  "subject": "AI Assistant Command Center Phase 1",
  "title": "Implemented AI Assistant Phase 1 command-center shell",
  "summary": "Implemented visible assistant modes, deterministic intent routing, extracted command-center UI components, and improved mobile shell while preserving existing generation flows.",
  "tags": ["ai-assistant", "command-center", "mobile", "intent-router"],
  "related_files": [
    "app/dashboard/assistant/chat-interface.tsx",
    "app/dashboard/assistant/assistant-types.ts",
    "app/dashboard/assistant/assistant-config.ts",
    "lib/assistant/intent-router.ts",
    "tests/developer-api/assistant-intent-router.test.ts"
  ]
}
```

## Plan Self-Review

Spec coverage:

1. Visible modes are covered by Tasks 1, 3, and 4.
2. Intent routing is covered by Task 2 and Task 4.
3. Mobile shell improvements are covered by Task 5 and Task 6.
4. Existing flow preservation is covered by Task 7.
5. Context packs and confirmed write actions are intentionally left for later phases, matching the design spec phase boundaries.

Placeholder scan:

No placeholder markers are present. Each code task includes exact files, snippets, commands, and expected results.

Type consistency:

The plan uses `AssistantMode`, `AssistantAction`, `AssistantFunctionName`, `AssistantIntent`, `AssistantMessage`, `MessageImage`, and `AssistantFlowState` consistently across type, router, test, and component tasks.
