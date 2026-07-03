# Mobile-Friendly Automation Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual canvas as the default automation builder with a mobile-friendly wizard that emits the existing `workflow_graph` format.

**Architecture:** Keep the graph executor and node worker model intact. Add pure wizard state, graph compiler, and permission-rule modules under `lib/automation-wizard`, then use them from a new wizard UI while moving the existing canvas behind an advanced entry point.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing shadcn/Radix UI primitives, existing `WorkflowGraph` types, existing Supabase-backed automation APIs.

---

## File Structure

- Create `lib/automation-wizard/types.ts`
  - Owns wizard state types, action descriptors, trigger descriptors, validation result types, and supported automation families.
- Create `lib/automation-wizard/compiler.ts`
  - Converts `AutomationWizardState` into a deterministic `WorkflowGraph`.
- Create `lib/automation-wizard/permissions.ts`
  - Maps wizard trigger/action choices to required Meta permissions and local capability labels.
- Create `lib/automation-wizard/summary.ts`
  - Builds plain-English review summaries from wizard state.
- Create `components/automation/wizard/automation-wizard.tsx`
  - Mobile-friendly multi-step wizard shell.
- Create `components/automation/wizard/wizard-stepper.tsx`
  - Compact step navigation and validation status.
- Create `components/automation/wizard/trigger-step.tsx`
  - Trigger, platform, account, and target selection.
- Create `components/automation/wizard/action-step.tsx`
  - Ordered action selection and action settings.
- Create `components/automation/wizard/review-step.tsx`
  - Summary, permission issues, save/activate controls.
- Modify `app/dashboard/automation/page.tsx`
  - Separate Publishing Automations, Engagement Wizard, and Advanced Visual Builder entry points.
- Modify `app/api/automations/route.ts`
  - Accept graph-backed wizard automations and validate required permissions using shared permission rules.
- Modify `components/automation/active-automations-list.tsx`
  - Display graph-backed wizard summaries cleanly.
- Modify `docs/app-review/ops/phase-2-permission-audit-plan.md`
  - Link this implementation plan after the shell/gating work lands.

## Task 1: Add Wizard Domain Types

**Files:**
- Create: `lib/automation-wizard/types.ts`
- Verify: `pnpm lint`

- [ ] **Step 1: Create the domain type file**

Add:

```ts
import type {
  ActionNodeType,
  TriggerNodeType,
  WorkflowNodeType,
} from "@/types/automation-graph"

export type AutomationWizardFamily = "publishing" | "engagement"
export type AutomationWizardPlatform = "instagram" | "facebook"
export type AutomationWizardMode = "draft" | "active"

export type WizardTriggerType = TriggerNodeType
export type WizardActionType = ActionNodeType

export interface WizardAccountSelection {
  socialAccountId: string
  platform: AutomationWizardPlatform
  accountName?: string
}

export interface WizardTargetSelection {
  postId?: string
  postThumbnailUrl?: string
  postCaption?: string
}

export interface WizardFilterConfig {
  triggerType: "any" | "keywords"
  keywords: string[]
}

export interface WizardAiConfig {
  enabled: boolean
  useGlobalSettings: boolean
  presetGoal: "auto" | "reply_comment" | "send_dm" | "welcome_new_follower" | "support_answer"
  tone: "friendly" | "professional" | "playful" | "empathetic" | "sales"
  length: "short" | "medium" | "long"
  emojiLevel: "none" | "light" | "medium" | "high"
  customInstructions: string
}

export interface WizardDelayConfig {
  enabled: boolean
  durationValue: number
  durationUnit: "seconds" | "minutes" | "hours" | "days"
}

export interface WizardActionConfig {
  type: WizardActionType
  enabled: boolean
  message?: string
  messages?: string[]
  openingMessage?: string
  buttonText?: string
  linkUrl?: string
  linkMessage?: string
  fallbackToPrivateReplyOnFailure?: boolean
  fallbackMessage?: string
  recipientEmail?: string
  emailSubject?: string
  emailBody?: string
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE"
  httpUrl?: string
  httpHeaders?: Record<string, string>
  httpBody?: string
  conditionType?: "keyword_match" | "follower_count" | "comment_count"
  conditionOperator?: "contains" | "not_contains" | "equals" | "greater_than" | "less_than"
  conditionKeywords?: string[]
  conditionThreshold?: number
}

export interface AutomationWizardState {
  name: string
  family: AutomationWizardFamily
  mode: AutomationWizardMode
  triggerType: WizardTriggerType
  account: WizardAccountSelection
  target: WizardTargetSelection
  filters: WizardFilterConfig
  ai: WizardAiConfig
  delay: WizardDelayConfig
  actions: WizardActionConfig[]
}

export interface WizardValidationIssue {
  field: string
  message: string
  severity: "error" | "warning"
}

export interface WizardCompileResult {
  graphNodeTypes: WorkflowNodeType[]
  warnings: WizardValidationIssue[]
}
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: lint completes with no errors from `lib/automation-wizard/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-wizard/types.ts
git commit -m "Add automation wizard domain types"
```

## Task 2: Add Graph Compiler

**Files:**
- Create: `lib/automation-wizard/compiler.ts`
- Modify: `lib/automation-wizard/types.ts`
- Verify: `pnpm lint`

- [ ] **Step 1: Implement deterministic graph compilation**

Create `lib/automation-wizard/compiler.ts`:

```ts
import { getDefaultConfig, type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@/types/automation-graph"
import type { AutomationWizardState, WizardActionConfig } from "./types"

function nodeId(index: number, type: string): string {
  return `wizard-${String(index).padStart(2, "0")}-${type}`
}

function edgeId(source: string, target: string, label?: string): string {
  return label ? `wizard-edge-${source}-${label}-${target}` : `wizard-edge-${source}-${target}`
}

function makeNode(index: number, type: WorkflowNode["data"]["type"], label: string, config: Record<string, unknown>): WorkflowNode {
  return {
    id: nodeId(index, type),
    type: type.startsWith("trigger_") ? "trigger" : "action",
    position: { x: index * 280, y: 120 },
    data: {
      type,
      label,
      config: { ...(getDefaultConfig(type) as Record<string, unknown>), ...config },
    },
  }
}

function enabledActions(state: AutomationWizardState): WizardActionConfig[] {
  return state.actions.filter((action) => action.enabled)
}

function actionLabel(type: WizardActionConfig["type"]): string {
  const labels: Record<WizardActionConfig["type"], string> = {
    action_send_dm: "Send DM",
    action_private_reply: "Private Reply",
    action_reply_comment: "Reply to Comment",
    action_delay: "Delay",
    action_condition: "Condition",
    action_send_email: "Send Email",
    action_http_request: "HTTP Request",
    action_ai_response: "AI Response",
  }
  return labels[type]
}

function actionConfig(action: WizardActionConfig): Record<string, unknown> {
  switch (action.type) {
    case "action_reply_comment":
      return { use_ai_response: false, messages: action.messages?.length ? action.messages : [action.message || "Thanks for your comment."] }
    case "action_send_dm":
      return {
        use_ai_response: false,
        opening_message: action.openingMessage || action.message || "",
        button_text: action.buttonText || "",
        link_url: action.linkUrl || "",
        link_message: action.linkMessage || "",
        fallback_to_private_reply_on_failure: !!action.fallbackToPrivateReplyOnFailure,
        fallback_message: action.fallbackMessage || "",
      }
    case "action_private_reply":
      return { use_ai_response: false, message: action.message || "" }
    case "action_send_email":
      return {
        recipient_type: "custom",
        recipient_email: action.recipientEmail || "",
        subject: action.emailSubject || "",
        body: action.emailBody || "",
      }
    case "action_http_request":
      return {
        method: action.httpMethod || "POST",
        url: action.httpUrl || "",
        headers: action.httpHeaders || {},
        body: action.httpBody || "",
      }
    case "action_condition":
      return {
        condition_type: action.conditionType || "keyword_match",
        operator: action.conditionOperator || "contains",
        keywords: action.conditionKeywords || [],
        threshold: action.conditionThreshold,
      }
    case "action_delay":
      return { duration_value: 5, duration_unit: "minutes" }
    case "action_ai_response":
      return { use_global_settings: true, max_tokens: 500, preset_goal: "auto", tone: "friendly", length: "short", emoji_level: "light" }
  }
}

export function compileAutomationWizardGraph(state: AutomationWizardState): WorkflowGraph {
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []

  nodes.push(makeNode(0, state.triggerType, "Trigger", {
    platform: state.account.platform,
    social_account_id: state.account.socialAccountId,
    trigger_type: state.filters.triggerType,
    keywords: state.filters.keywords,
    post_id: state.target.postId || "",
    post_thumbnail_url: state.target.postThumbnailUrl || "",
    post_caption: state.target.postCaption || "",
  }))

  let index = 1
  if (state.delay.enabled) {
    nodes.push(makeNode(index++, "action_delay", "Delay", {
      duration_value: state.delay.durationValue,
      duration_unit: state.delay.durationUnit,
    }))
  }

  if (state.ai.enabled) {
    nodes.push(makeNode(index++, "action_ai_response", "AI Response", {
      use_global_settings: state.ai.useGlobalSettings,
      max_tokens: 500,
      preset_goal: state.ai.presetGoal,
      tone: state.ai.tone,
      length: state.ai.length,
      emoji_level: state.ai.emojiLevel,
      custom_instructions: state.ai.customInstructions,
    }))
  }

  for (const action of enabledActions(state)) {
    if (action.type === "action_delay" || action.type === "action_ai_response") continue
    nodes.push(makeNode(index++, action.type, actionLabel(action.type), actionConfig(action)))
  }

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const source = nodes[i].id
    const target = nodes[i + 1].id
    edges.push({ id: edgeId(source, target), source, target, type: "custom", animated: true })
  }

  return { nodes, edges }
}
```

- [ ] **Step 2: Add validation helper to types**

Append to `lib/automation-wizard/types.ts`:

```ts
export interface WizardGraphCompileOptions {
  includeVisualPositions?: boolean
}
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: no TypeScript or ESLint errors in `lib/automation-wizard/compiler.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/automation-wizard/types.ts lib/automation-wizard/compiler.ts
git commit -m "Add automation wizard graph compiler"
```

## Task 3: Add Permission Rules

**Files:**
- Create: `lib/automation-wizard/permissions.ts`
- Verify: `pnpm lint`

- [ ] **Step 1: Implement permission mapping**

Create:

```ts
import type { AutomationWizardPlatform, AutomationWizardState, WizardActionType, WizardTriggerType } from "./types"

export interface WizardPermissionRequirement {
  permission: string
  reason: string
  platform: AutomationWizardPlatform
}

function triggerPermissions(triggerType: WizardTriggerType, platform: AutomationWizardPlatform): WizardPermissionRequirement[] {
  if (triggerType === "trigger_new_comment") {
    return platform === "facebook"
      ? [{ permission: "pages_read_engagement", platform, reason: "Read Facebook Page comments for comment triggers." }]
      : [{ permission: "instagram_manage_comments", platform, reason: "Read Instagram comments for comment triggers." }]
  }
  if (triggerType === "trigger_new_message") {
    return platform === "facebook"
      ? [{ permission: "pages_messaging", platform, reason: "Read Facebook Page conversations and messages." }]
      : [{ permission: "instagram_manage_messages", platform, reason: "Read Instagram messages." }]
  }
  return []
}

function actionPermissions(actionType: WizardActionType, platform: AutomationWizardPlatform): WizardPermissionRequirement[] {
  if (actionType === "action_reply_comment") {
    return platform === "facebook"
      ? [{ permission: "pages_manage_engagement", platform, reason: "Reply to or manage Facebook Page comments." }]
      : [{ permission: "instagram_manage_comments", platform, reason: "Reply to Instagram comments." }]
  }
  if (actionType === "action_send_dm" || actionType === "action_private_reply") {
    return platform === "facebook"
      ? [{ permission: "pages_messaging", platform, reason: "Send Facebook Page messages or private replies." }]
      : [{ permission: "instagram_manage_messages", platform, reason: "Send Instagram messages or private replies." }]
  }
  return []
}

export function getWizardPermissionRequirements(state: AutomationWizardState): WizardPermissionRequirement[] {
  const requirements = [
    ...triggerPermissions(state.triggerType, state.account.platform),
    ...state.actions.flatMap((action) => action.enabled ? actionPermissions(action.type, state.account.platform) : []),
  ]

  const byPermission = new Map<string, WizardPermissionRequirement>()
  for (const requirement of requirements) {
    byPermission.set(`${requirement.platform}:${requirement.permission}`, requirement)
  }
  return Array.from(byPermission.values())
}
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-wizard/permissions.ts
git commit -m "Add automation wizard permission rules"
```

## Task 4: Add Plain-English Summary

**Files:**
- Create: `lib/automation-wizard/summary.ts`
- Verify: `pnpm lint`

- [ ] **Step 1: Implement summary builder**

Create:

```ts
import type { AutomationWizardState } from "./types"

function triggerText(state: AutomationWizardState): string {
  if (state.triggerType === "trigger_new_comment") {
    const filter = state.filters.triggerType === "keywords" && state.filters.keywords.length
      ? ` with ${state.filters.keywords.map((k) => `"${k}"`).join(", ")}`
      : ""
    return `someone comments${filter}`
  }
  if (state.triggerType === "trigger_new_message") return "someone sends a message"
  if (state.triggerType === "trigger_new_follower") return "someone follows the account"
  if (state.triggerType === "trigger_cron") return "the schedule is due"
  if (state.triggerType === "trigger_story_mention") return "someone mentions the account in a story"
  return "someone replies to a story"
}

function actionText(state: AutomationWizardState): string {
  const parts: string[] = []
  if (state.delay.enabled) parts.push(`wait ${state.delay.durationValue} ${state.delay.durationUnit}`)
  if (state.ai.enabled) parts.push("generate an AI response")
  for (const action of state.actions.filter((item) => item.enabled)) {
    if (action.type === "action_reply_comment") parts.push("reply publicly")
    if (action.type === "action_send_dm") parts.push("send a DM")
    if (action.type === "action_private_reply") parts.push("send a private reply")
    if (action.type === "action_send_email") parts.push("send an email alert")
    if (action.type === "action_http_request") parts.push("call an external webhook")
    if (action.type === "action_condition") parts.push("check the configured condition")
  }
  return parts.length ? parts.join(", then ") : "record the event"
}

export function summarizeAutomationWizard(state: AutomationWizardState): string {
  const platform = state.account.platform === "facebook" ? "Facebook" : "Instagram"
  return `When ${triggerText(state)} on ${platform}, ${actionText(state)}.`
}
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 3: Commit**

```bash
git add lib/automation-wizard/summary.ts
git commit -m "Add automation wizard summary builder"
```

## Task 5: Add Wizard UI Shell

**Files:**
- Create: `components/automation/wizard/automation-wizard.tsx`
- Create: `components/automation/wizard/wizard-stepper.tsx`
- Verify: `pnpm lint`

- [ ] **Step 1: Add stepper component**

Create `components/automation/wizard/wizard-stepper.tsx`:

```tsx
"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WizardStep {
  id: string
  label: string
}

export function WizardStepper({
  steps,
  currentStep,
}: {
  steps: WizardStep[]
  currentStep: number
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const isDone = index < currentStep
        const isActive = index === currentStep
        return (
          <div
            key={step.id}
            className={cn(
              "flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
              isActive ? "border-violet-400/45 bg-violet-500/15 text-white" : "border-white/10 bg-white/3 text-white/45",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]">
              {isDone ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            {step.label}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add wizard shell**

Create `components/automation/wizard/automation-wizard.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { AutomationWizardState } from "@/lib/automation-wizard/types"
import { summarizeAutomationWizard } from "@/lib/automation-wizard/summary"
import { WizardStepper } from "./wizard-stepper"

const STEPS = [
  { id: "family", label: "Type" },
  { id: "trigger", label: "Trigger" },
  { id: "actions", label: "Actions" },
  { id: "review", label: "Review" },
]

function initialState(): AutomationWizardState {
  return {
    name: "New automation",
    family: "engagement",
    mode: "draft",
    triggerType: "trigger_new_comment",
    account: { socialAccountId: "", platform: "instagram" },
    target: {},
    filters: { triggerType: "any", keywords: [] },
    ai: {
      enabled: false,
      useGlobalSettings: true,
      presetGoal: "auto",
      tone: "friendly",
      length: "short",
      emojiLevel: "light",
      customInstructions: "",
    },
    delay: { enabled: false, durationValue: 5, durationUnit: "minutes" },
    actions: [],
  }
}

export function AutomationWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [state] = useState<AutomationWizardState>(() => initialState())
  const summary = useMemo(() => summarizeAutomationWizard(state), [state])

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-4xl flex-col gap-4">
      <WizardStepper steps={STEPS} currentStep={step} />
      <section className="min-h-[420px] rounded-xl border border-white/10 bg-[#151620] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{STEPS[step].label}</div>
        <h2 className="mt-2 text-xl font-semibold text-white/90">Automation wizard</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/50">{summary}</p>
      </section>
      <div className="sticky bottom-0 flex items-center justify-between border-t border-white/10 bg-[#080912]/95 py-3">
        <Button variant="ghost" onClick={step === 0 ? onBack : () => setStep((value) => Math.max(0, value - 1))}>
          {step === 0 ? "Back to automation" : "Back"}
        </Button>
        <Button onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>
          {step === STEPS.length - 1 ? "Save Draft" : "Continue"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/automation/wizard/automation-wizard.tsx components/automation/wizard/wizard-stepper.tsx
git commit -m "Add automation wizard shell"
```

## Task 6: Wire Automation Page Entry Points

**Files:**
- Modify: `app/dashboard/automation/page.tsx`
- Verify: `pnpm lint`

- [ ] **Step 1: Import wizard**

Add:

```ts
import { AutomationWizard } from "@/components/automation/wizard/automation-wizard"
```

- [ ] **Step 2: Extend editor view state**

Change:

```ts
type EditorView = 'list' | 'canvas' | 'wizard'
```

To:

```ts
type EditorView = 'list' | 'canvas' | 'wizard' | 'wizard_graph'
```

- [ ] **Step 3: Add wizard graph entry handler**

Add inside `AutomationPage`:

```ts
const handleCreateWizardGraph = () => {
  if (!canWriteAutomations) {
    showReadOnlyToast()
    return
  }
  setEditingAutomation(null)
  resetCanvasDraftSeed()
  setEditorView('wizard_graph')
}
```

- [ ] **Step 4: Render wizard view before list view**

Add before the canvas view return or directly after it:

```tsx
if (editorView === 'wizard_graph') {
  return (
    <AutomationWizard
      onBack={() => {
        setEditorView('list')
        setEditingAutomation(null)
      }}
    />
  )
}
```

- [ ] **Step 5: Add list button for wizard-first engagement automation**

In the page header actions, add a button that calls `handleCreateWizardGraph` and uses copy `New Automation`.

Expected behavior:

- "New Automation" opens the wizard.
- The visual builder remains reachable from a separate advanced action.
- Existing publishing automation panel remains unchanged.

- [ ] **Step 6: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/automation/page.tsx
git commit -m "Wire graph wizard into automation page"
```

## Task 7: Add Trigger and Action Steps

**Files:**
- Create: `components/automation/wizard/trigger-step.tsx`
- Create: `components/automation/wizard/action-step.tsx`
- Modify: `components/automation/wizard/automation-wizard.tsx`
- Verify: `pnpm lint`

- [ ] **Step 1: Create trigger step**

Create a compact trigger step that updates `triggerType`, platform, filter type, and keywords. Use select/buttons already used elsewhere in the app.

Required behavior:

- User can choose comment, message, follower, schedule, story mention, or story reply.
- User can choose Instagram or Facebook.
- Keyword input is visible only when filter type is `keywords`.

- [ ] **Step 2: Create action step**

Create an action selector that toggles the current action set:

- AI Response
- Reply to Comment
- Send DM
- Private Reply
- Delay
- Condition
- Send Email
- HTTP Request

Each selected action must be represented as a `WizardActionConfig` item in `state.actions`.

- [ ] **Step 3: Update shell state setter**

In `automation-wizard.tsx`, change:

```ts
const [state] = useState<AutomationWizardState>(() => initialState())
```

To:

```ts
const [state, setState] = useState<AutomationWizardState>(() => initialState())
```

Render `TriggerStep` for trigger step and `ActionStep` for actions step.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 5: Commit**

```bash
git add components/automation/wizard/trigger-step.tsx components/automation/wizard/action-step.tsx components/automation/wizard/automation-wizard.tsx
git commit -m "Add automation wizard trigger and action steps"
```

## Task 8: Add Review Step and Save Draft

**Files:**
- Create: `components/automation/wizard/review-step.tsx`
- Modify: `components/automation/wizard/automation-wizard.tsx`
- Modify: `app/api/automations/route.ts`
- Verify: `pnpm lint`

- [ ] **Step 1: Create review step**

The review step must display:

- summary from `summarizeAutomationWizard`
- required permissions from `getWizardPermissionRequirements`
- generated graph node labels from `compileAutomationWizardGraph`
- Save Draft button state

- [ ] **Step 2: Add save handler in wizard shell**

Use:

```ts
const handleSaveDraft = async () => {
  const graph = compileAutomationWizardGraph(state)
  const response = await fetch('/api/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: state.name,
      editor_version: 'wizard',
      workflow_graph: graph,
      social_account_id: state.account.socialAccountId,
      is_active: false,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to save automation draft')
  }
}
```

- [ ] **Step 3: Ensure API accepts graph-backed wizard saves**

In `app/api/automations/route.ts`, confirm the existing `isCanvasMode` detection accepts `workflow_graph` even when `editor_version` is `wizard`.

If needed, change:

```ts
const isCanvasMode = editor_version === 'canvas' || !!workflow_graph;
```

To:

```ts
const isGraphBackedMode = editor_version === 'canvas' || !!workflow_graph;
const isCanvasMode = isGraphBackedMode;
```

Then preserve `editor_version: editor_version === 'canvas' ? 'canvas' : 'wizard'` in inserted rows.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 5: Commit**

```bash
git add components/automation/wizard/review-step.tsx components/automation/wizard/automation-wizard.tsx app/api/automations/route.ts
git commit -m "Save graph-backed wizard automations"
```

## Task 9: Gate Advanced and Engagement Surfaces

**Files:**
- Modify: `app/dashboard/automation/page.tsx`
- Modify: `components/automation/active-automations-list.tsx`
- Verify: `pnpm lint`

- [ ] **Step 1: Separate copy and actions**

Automation page should show three clear areas:

- Publishing Automations
- Engagement Automations
- Advanced Visual Builder

Publishing automations stay visible. Engagement wizard can be visible as a draft builder but should clearly show permission locks where scopes are unavailable. Advanced visual builder should be labeled advanced.

- [ ] **Step 2: Improve active automation labels**

For graph-backed wizard automations, show:

- trigger type
- action count
- draft/active status
- permission issue summary when available

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/automation/page.tsx components/automation/active-automations-list.tsx
git commit -m "Separate automation builder surfaces"
```

## Task 10: Verification and Documentation

**Files:**
- Modify: `docs/app-review/ops/phase-2-permission-audit-plan.md`
- Verify: `pnpm lint`, `pnpm build`

- [ ] **Step 1: Update permission audit doc**

Add a short note under Automation:

```md
Automation builder direction: the default automation builder is now planned as wizard-first and graph-backed. Publishing automations remain separate from engagement automations. The visual canvas is advanced/internal and should not be used as the reviewer-facing default path.
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: no lint errors.

- [ ] **Step 3: Run build**

Run: `pnpm build`

Expected: build completes. If environment validation blocks local build because production secrets are absent, run `pnpm validate:env` and record the exact missing variables in the task result.

- [ ] **Step 4: Commit**

```bash
git add docs/app-review/ops/phase-2-permission-audit-plan.md
git commit -m "Document automation builder review direction"
```

## Self-Review

Spec coverage:

- Wizard-first default: Task 6 and Task 9.
- Graph-backed execution: Task 2 and Task 8.
- Existing node coverage: Task 1, Task 2, and Task 7.
- Mobile-friendly flow: Task 5 and Task 7.
- Permission gates: Task 3, Task 8, and Task 9.
- Advanced visual builder retained: Task 6 and Task 9.
- Documentation: Task 10.

Placeholder scan:

- No unresolved `TBD` or `TODO` markers.
- No task depends on an unnamed file or unknown command.

Type consistency:

- `AutomationWizardState`, `WizardActionConfig`, and `WizardPermissionRequirement` are defined before use.
- Compiler output remains `WorkflowGraph`, matching the existing graph executor.
