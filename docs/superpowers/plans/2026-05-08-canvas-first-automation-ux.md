# Canvas-First Automation UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the new form-based automation wizard path, restore the visual canvas as the single engagement automation editor, keep canvas templates as ready node presets, and make the canvas usable enough on mobile for live permission testing.

**Architecture:** The Automation page routes all engagement automation creation and editing through `WorkflowCanvas`. Template selection only seeds a `WorkflowGraph` into the canvas; saving remains the existing canvas save endpoint. Trigger availability is driven by the existing webhook/orchestrator surface, and delay stays an advanced canvas node with explicit runtime verification before templates depend on it.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/Radix UI, `@xyflow/react`, Supabase Edge Functions.

---

## File Map

- Modify `app/dashboard/automation/page.tsx`: remove guided wizard/form template entry points, make "New Automation" open the canvas template picker, keep legacy setup modal only for legacy non-canvas edits.
- Modify `components/automation/automation-template-picker.tsx`: keep this as the only engagement template picker, tune copy and mobile sizing.
- Modify `components/automation/canvas/workflow-canvas.tsx`: add mobile shell behavior, shorter mobile helper copy, hide minimap on small screens, and provide a mobile config panel host.
- Modify `components/automation/canvas/workflow-toolbar.tsx`: make save/active controls reachable on mobile through a compact sticky action bar.
- Modify `components/automation/canvas/workflow-sidebar.tsx`: expose only validated trigger nodes, reduce mobile width, and support touch-first node add.
- Modify `components/automation/canvas/nodes/node-config-panel.tsx`: support mobile bottom-sheet layout and add config fields for every exposed trigger.
- Modify `types/automation-graph.ts`: add a single exported trigger capability list used by sidebar and validation copy.
- Modify `app/api/automations/validate/route.ts`: reject unsupported canvas trigger nodes with a clear error before save.
- Modify `supabase/functions/automation-orchestrator/index.ts`: remove temporary trigger disables only for triggers proven by webhook routing.
- Modify `supabase/functions/process-automations/graph-executor.ts`: verify and fix delay resume behavior if the live test shows skipped downstream nodes.
- Delete `components/automation/templates/template-gallery.tsx`.
- Delete `components/automation/templates/template-form-modal.tsx`.
- Delete `components/automation/templates/fields/keywords-field.tsx`.
- Delete `components/automation/templates/fields/platform-field.tsx`.
- Delete `components/automation/templates/fields/post-field.tsx`.
- Delete `components/automation/templates/fields/social-account-field.tsx`.
- Delete `components/automation/templates/fields/tone-field.tsx`.
- Delete `components/automation/wizard/action-step.tsx`.
- Delete `components/automation/wizard/automation-wizard.tsx`.
- Delete `components/automation/wizard/review-step.tsx`.
- Delete `components/automation/wizard/setup-step.tsx`.
- Delete `components/automation/wizard/trigger-step.tsx`.
- Delete `components/automation/wizard/wizard-stepper.tsx`.
- Delete `lib/automation-wizard/compiler.ts`.
- Delete `lib/automation-wizard/permissions.ts`.
- Delete `lib/automation-wizard/summary.ts`.
- Delete `lib/automation-wizard/types.ts`.

---

### Task 1: Make Canvas Templates The Only New Engagement Automation Path

**Files:**
- Modify: `app/dashboard/automation/page.tsx`

- [ ] **Step 1: Confirm current wizard/form imports are still present**

Run:

```powershell
rg "TemplateGallery|TemplateFormModal|AutomationWizard|wizard_graph|selectedTemplate" app/dashboard/automation/page.tsx
```

Expected: matches are printed. This confirms the page still exposes the flow being removed.

- [ ] **Step 2: Replace imports and editor view type**

In `app/dashboard/automation/page.tsx`, replace the top imports and editor type with this shape:

```tsx
import { useState, useCallback } from "react"
import useSWR from "swr"
import { Zap, Plus, Workflow, Sparkles, ShieldAlert } from "lucide-react"
import { AutomationCard } from "@/components/automation/automation-card"
import { AutomationSetupModal } from "@/components/automation/automation-setup-modal"
import { ActiveAutomationsList } from "@/components/automation/active-automations-list"
import { AutomationTemplatePicker } from "@/components/automation/automation-template-picker"
import { PublishingAutomationsPanel } from "@/components/automation/publishing-automations-panel"
import { WorkflowCanvas } from "@/components/automation/canvas/workflow-canvas"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { Automation } from "@/types/automation"
import { WorkflowGraph } from "@/types/automation-graph"
import { useToast } from "@/components/ui/use-toast"
import type { AutomationTemplateDefinition } from "@/lib/automation-templates"

type EditorView = 'list' | 'canvas'
```

- [ ] **Step 3: Remove form wizard state and handlers**

Delete these items from `AutomationPage`:

```tsx
const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplateDefinition | null>(null)
const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false)
const templatesSectionRef = useRef<HTMLDivElement | null>(null)

const handleCreateWizardGraph = () => { ... }
const handleOpenTemplateGallery = () => { ... }
const handlePickTemplate = (template: AutomationTemplateDefinition) => { ... }
const handleTemplateSaved = () => { ... }
```

Then replace `handleCreateCanvas` and `handleOpenTemplatePicker` with:

```tsx
const handleCreateCanvas = () => {
    if (!canWriteAutomations) {
        showReadOnlyToast()
        return
    }
    setEditingAutomation(null)
    resetCanvasDraftSeed()
    setEditorView('canvas')
}

const handleOpenTemplatePicker = () => {
    if (!canWriteAutomations) {
        showReadOnlyToast()
        return
    }
    setEditingAutomation(null)
    resetCanvasDraftSeed()
    setIsTemplatePickerOpen(true)
}
```

- [ ] **Step 4: Route header and empty-state buttons to the template picker**

Replace every `onClick={handleOpenTemplateGallery}` in `app/dashboard/automation/page.tsx` with `onClick={handleOpenTemplatePicker}`.

Keep `handleCreateCanvas` for the advanced blank canvas card/button.

- [ ] **Step 5: Remove wizard graph render branch**

Delete this branch entirely:

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

- [ ] **Step 6: Replace the templates/gallery and advanced builder sections**

Replace the old `TemplateGallery` section and three-card builder block with:

```tsx
<div>
    <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Canvas Templates
        </h2>
        <p className="text-xs" style={{ color: AUTO_PAGE_THEME.muted }}>
            Start from ready node sets, then configure the account, post, message, and AI steps on the canvas.
        </p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
        <AutomationCard
            icon={Sparkles}
            title="Start From Template"
            description="Load a tested canvas workflow for comments, DMs, followers, or story replies, then review the nodes before saving."
            onClick={handleOpenTemplatePicker}
            badge="Recommended"
            disabled={!canWriteAutomations}
        />
        <AutomationCard
            icon={Workflow}
            title="Blank Canvas"
            description="Build a custom automation with triggers, conditions, delay, AI response, and engagement actions."
            onClick={handleCreateCanvas}
            badge="Advanced"
            disabled={!canWriteAutomations}
        />
    </div>
</div>
```

- [ ] **Step 7: Remove form modal JSX**

Delete the `TemplateFormModal` JSX block at the bottom of the page. Keep `AutomationTemplatePicker` and `AutomationSetupModal`.

- [ ] **Step 8: Run targeted checks**

Run:

```powershell
rg "TemplateGallery|TemplateFormModal|AutomationWizard|wizard_graph|selectedTemplate" app/dashboard/automation/page.tsx
pnpm exec tsc --noEmit
```

Expected:
- `rg` exits with no matches for the removed symbols.
- TypeScript reports no errors from `app/dashboard/automation/page.tsx`.

- [ ] **Step 9: Commit**

Run:

```powershell
git add app/dashboard/automation/page.tsx
git commit -m "Return automation creation to canvas templates"
```

---

### Task 2: Delete The New Wizard/Form Template Modules

**Files:**
- Delete: `components/automation/templates/template-gallery.tsx`
- Delete: `components/automation/templates/template-form-modal.tsx`
- Delete: `components/automation/templates/fields/keywords-field.tsx`
- Delete: `components/automation/templates/fields/platform-field.tsx`
- Delete: `components/automation/templates/fields/post-field.tsx`
- Delete: `components/automation/templates/fields/social-account-field.tsx`
- Delete: `components/automation/templates/fields/tone-field.tsx`
- Delete: `components/automation/wizard/action-step.tsx`
- Delete: `components/automation/wizard/automation-wizard.tsx`
- Delete: `components/automation/wizard/review-step.tsx`
- Delete: `components/automation/wizard/setup-step.tsx`
- Delete: `components/automation/wizard/trigger-step.tsx`
- Delete: `components/automation/wizard/wizard-stepper.tsx`
- Delete: `lib/automation-wizard/compiler.ts`
- Delete: `lib/automation-wizard/permissions.ts`
- Delete: `lib/automation-wizard/summary.ts`
- Delete: `lib/automation-wizard/types.ts`

- [ ] **Step 1: Verify no active imports remain**

Run:

```powershell
rg "components/automation/templates|components/automation/wizard|lib/automation-wizard|automation-wizard"
```

Expected: only docs, old plan files, or generated summaries mention these paths. No `app/`, `components/`, `lib/`, or `types/` runtime import should remain.

- [ ] **Step 2: Delete the unused files**

Run a non-recursive, explicit delete:

```powershell
Remove-Item -LiteralPath `
  'components/automation/templates/template-gallery.tsx', `
  'components/automation/templates/template-form-modal.tsx', `
  'components/automation/templates/fields/keywords-field.tsx', `
  'components/automation/templates/fields/platform-field.tsx', `
  'components/automation/templates/fields/post-field.tsx', `
  'components/automation/templates/fields/social-account-field.tsx', `
  'components/automation/templates/fields/tone-field.tsx', `
  'components/automation/wizard/action-step.tsx', `
  'components/automation/wizard/automation-wizard.tsx', `
  'components/automation/wizard/review-step.tsx', `
  'components/automation/wizard/setup-step.tsx', `
  'components/automation/wizard/trigger-step.tsx', `
  'components/automation/wizard/wizard-stepper.tsx', `
  'lib/automation-wizard/compiler.ts', `
  'lib/automation-wizard/permissions.ts', `
  'lib/automation-wizard/summary.ts', `
  'lib/automation-wizard/types.ts'
```

- [ ] **Step 3: Remove empty directories if PowerShell reports them empty**

Run:

```powershell
Get-ChildItem -LiteralPath 'components/automation/templates' -Recurse -Force
Get-ChildItem -LiteralPath 'components/automation/wizard' -Recurse -Force
Get-ChildItem -LiteralPath 'lib/automation-wizard' -Recurse -Force
```

If a directory has no files left, remove that empty directory with `Remove-Item -LiteralPath '<directory>'`.

- [ ] **Step 4: Run runtime import search and TypeScript**

Run:

```powershell
rg "TemplateGallery|TemplateFormModal|AutomationWizard|AutomationWizardState|summarizeAutomationWizard|buildAutomationWizardGraph" app components lib types supabase
pnpm exec tsc --noEmit
```

Expected:
- `rg` has no runtime matches.
- TypeScript passes, or failures are unrelated pre-existing files and are listed before proceeding.

- [ ] **Step 5: Commit**

Run:

```powershell
git add components/automation/templates components/automation/wizard lib/automation-wizard
git commit -m "Remove abandoned automation wizard modules"
```

---

### Task 3: Keep Template Definitions As Canvas Presets

**Files:**
- Modify: `lib/automation-templates/types.ts`
- Modify: `lib/automation-templates/templates/reply-comments-ai.ts`
- Modify: `lib/automation-templates/templates/dm-commenters-link.ts`
- Modify: `lib/automation-templates/templates/private-reply-commenters.ts`
- Modify: `lib/automation-templates/templates/dm-ai-autoreply.ts`
- Modify: `lib/automation-templates/templates/welcome-followers.ts`
- Modify: `lib/automation-templates/templates/story-mention-reply.ts`
- Modify: `components/automation/automation-template-picker.tsx`

- [ ] **Step 1: Simplify the template type**

Replace `lib/automation-templates/types.ts` with a canvas-only interface:

```ts
// lib/automation-templates/types.ts
import type { LucideIcon } from 'lucide-react'
import type { WorkflowGraph } from '@/types/automation-graph'

export type AutomationTemplatePlatform = 'instagram' | 'facebook'

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'comments' | 'messages' | 'growth' | 'mentions'
  icon: LucideIcon
  supportedPlatforms: AutomationTemplatePlatform[]
  tags?: string[]
  buildGraph: () => WorkflowGraph
}
```

- [ ] **Step 2: Remove form-only fields from each template definition**

In every file under `lib/automation-templates/templates/*.ts`, remove these object properties:

```ts
fields: [...]
defaultName: (...) => ...
buildGraphFromForm: (...) => ...
```

Keep `buildGraph` and make it return a usable default graph with blank account/post/message config. For templates that currently call `buildGraphFromForm`, inline the default config into `buildGraph` instead.

- [ ] **Step 3: Keep picker copy canvas-specific**

In `components/automation/automation-template-picker.tsx`, set the dialog description to:

```tsx
<DialogDescription style={{ color: "rgba(255,255,255,0.45)" }}>
  Templates load ready node sets into the canvas. Select the social account, review the messages, then save when the workflow is correct.
</DialogDescription>
```

Also change the use button text to:

```tsx
Load Canvas
```

- [ ] **Step 4: Run template checks**

Run:

```powershell
rg "fields:|defaultName|buildGraphFromForm|TemplateField|TemplateFormValues" lib/automation-templates components/automation/automation-template-picker.tsx
pnpm exec tsc --noEmit
```

Expected:
- `rg` has no matches in runtime template code.
- TypeScript passes or reports only unrelated existing issues.

- [ ] **Step 5: Commit**

Run:

```powershell
git add lib/automation-templates components/automation/automation-template-picker.tsx
git commit -m "Keep automation templates as canvas presets"
```

---

### Task 4: Make The Canvas Mobile-Reachable

**Files:**
- Modify: `components/automation/canvas/workflow-canvas.tsx`
- Modify: `components/automation/canvas/workflow-toolbar.tsx`
- Modify: `components/automation/canvas/workflow-sidebar.tsx`
- Modify: `components/automation/canvas/nodes/node-config-panel.tsx`

- [ ] **Step 1: Make toolbar responsive and keep save visible**

In `components/automation/canvas/workflow-toolbar.tsx`, change the root and major groups to wrap on mobile:

```tsx
<div
  className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-2 py-2 sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0"
  style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#151620' }}
>
```

Use `className="flex min-w-0 items-center gap-2"` for the left group, `className="hidden items-center gap-1 sm:flex"` for undo/redo/auto-layout, and `className="flex shrink-0 items-center gap-2"` for active/save.

Set the name input to:

```tsx
className="w-32 rounded bg-transparent px-2 py-1 text-sm font-medium outline-none sm:w-48"
```

- [ ] **Step 2: Add a mobile bottom action bar in the toolbar**

Below the desktop right group, add a mobile-only full-width row:

```tsx
<div className="flex w-full items-center gap-2 sm:hidden">
  <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.68)' }}>
    <Undo className="h-4 w-4" />
  </Button>
  <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.68)' }}>
    <Redo className="h-4 w-4" />
  </Button>
  <Button variant="ghost" size="icon" onClick={onAutoLayout} className="h-8 w-8" style={{ background: '#1b1d28', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' }}>
    <LayoutDashboard className="h-4 w-4" />
  </Button>
</div>
```

- [ ] **Step 3: Collapse sidebar by default on touch-sized screens**

In `components/automation/canvas/workflow-canvas.tsx`, initialize collapsed state from viewport:

```tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
})
```

- [ ] **Step 4: Shorten helper copy on mobile and hide minimap**

Replace the canvas helper block with desktop/mobile variants:

```tsx
<div className="pointer-events-none absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 rounded-lg border px-3 py-2 text-xs sm:block" ...>
  Drag from a node&apos;s bottom dot to another node&apos;s top dot to connect. Alert outputs run only when the node fails.
</div>
<div className="pointer-events-none absolute left-3 right-3 top-3 z-20 rounded-lg border px-3 py-2 text-[11px] sm:hidden" ...>
  Tap a node to configure it. Use the side icons to add nodes.
</div>
```

Wrap `MiniMap` in:

```tsx
<div className="hidden sm:block">
  <MiniMap ... />
</div>
```

- [ ] **Step 5: Make node config a bottom sheet on mobile**

Change `NodeConfigPanel` root to accept a `mobile` prop:

```tsx
interface NodeConfigPanelProps {
  node: WorkflowNode
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  onClose: () => void
  onDelete: (nodeId: string) => void
  mobile?: boolean
}
```

Use this root class:

```tsx
className={cn(
  "overflow-y-auto",
  mobile
    ? "absolute inset-x-0 bottom-0 z-30 max-h-[72vh] rounded-t-xl shadow-2xl"
    : "h-full w-80"
)}
```

In `WorkflowCanvas`, render the panel like:

```tsx
{selectedNode && (
  <>
    <div className="hidden sm:block">
      <NodeConfigPanel node={selectedNode} onUpdate={handleNodeUpdate} onClose={() => setSelectedNode(null)} onDelete={handleNodeDelete} />
    </div>
    <div className="sm:hidden">
      <NodeConfigPanel mobile node={selectedNode} onUpdate={handleNodeUpdate} onClose={() => setSelectedNode(null)} onDelete={handleNodeDelete} />
    </div>
  </>
)}
```

- [ ] **Step 6: Run mobile type and lint checks**

Run:

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint components/automation/canvas/workflow-canvas.tsx components/automation/canvas/workflow-toolbar.tsx components/automation/canvas/workflow-sidebar.tsx components/automation/canvas/nodes/node-config-panel.tsx
```

Expected: no errors in the touched canvas files.

- [ ] **Step 7: Commit**

Run:

```powershell
git add components/automation/canvas
git commit -m "Improve automation canvas mobile controls"
```

---

### Task 5: Gate Trigger Nodes Against Validated Webhook Support

**Files:**
- Modify: `types/automation-graph.ts`
- Modify: `components/automation/canvas/workflow-sidebar.tsx`
- Modify: `components/automation/canvas/nodes/node-config-panel.tsx`
- Modify: `app/api/automations/validate/route.ts`
- Modify: `supabase/functions/automation-orchestrator/index.ts`

- [ ] **Step 1: Add a shared supported-trigger list**

In `types/automation-graph.ts`, add:

```ts
export const SUPPORTED_CANVAS_TRIGGER_TYPES: TriggerNodeType[] = [
  'trigger_new_comment',
  'trigger_new_message',
  'trigger_story_reply',
]
```

Do not include `trigger_story_mention` until the story mention webhook payload is live-tested. Do not include `trigger_new_follower` until a reliable follower event source is confirmed.

- [ ] **Step 2: Use the shared list in the sidebar**

In `components/automation/canvas/workflow-sidebar.tsx`, replace the local `supportedTriggers` set with:

```tsx
import { NODE_CATALOG, SUPPORTED_CANVAS_TRIGGER_TYPES, type NodeCatalogEntry } from '@/types/automation-graph'

const supportedTriggers = new Set(SUPPORTED_CANVAS_TRIGGER_TYPES)
```

- [ ] **Step 3: Add config handling for story replies**

In `components/automation/canvas/nodes/node-config-panel.tsx`, import `TriggerStoryReplyConfig` and add:

```tsx
case 'trigger_story_reply':
  return <TriggerStoryMentionFields config={config as unknown as TriggerStoryReplyConfig} onUpdate={updateConfig} />
```

This reuses the social account picker fields because story mention and story reply currently need the same account-level configuration.

- [ ] **Step 4: Reject unsupported triggers at save validation**

In `app/api/automations/validate/route.ts`, import `SUPPORTED_CANVAS_TRIGGER_TYPES` and check trigger nodes:

```ts
const supportedTriggers = new Set(SUPPORTED_CANVAS_TRIGGER_TYPES)
const unsupportedTrigger = nodes.find((node) => {
  const type = String(node?.data?.type || '')
  return type.startsWith('trigger_') && !supportedTriggers.has(type as TriggerNodeType)
})

if (unsupportedTrigger) {
  errors.push({
    code: 'unsupported_trigger',
    message: `${unsupportedTrigger.data?.label || 'This trigger'} is not enabled for live automations yet.`,
  })
}
```

Keep the existing validation response shape.

- [ ] **Step 5: Keep story mention disabled in orchestrator**

In `supabase/functions/automation-orchestrator/index.ts`, keep:

```ts
const TEMP_DISABLED_TRIGGER_TYPES = new Set([
  'trigger_story_mention',
]);
```

Do not add `trigger_story_mention` to the sidebar until the matching webhook event has been tested in production.

- [ ] **Step 6: Run validation checks**

Run:

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint types/automation-graph.ts components/automation/canvas/workflow-sidebar.tsx components/automation/canvas/nodes/node-config-panel.tsx app/api/automations/validate/route.ts
```

Expected: no errors in touched files.

- [ ] **Step 7: Commit**

Run:

```powershell
git add types/automation-graph.ts components/automation/canvas/workflow-sidebar.tsx components/automation/canvas/nodes/node-config-panel.tsx app/api/automations/validate/route.ts supabase/functions/automation-orchestrator/index.ts
git commit -m "Gate canvas triggers by validated webhook support"
```

---

### Task 6: Verify And Fix Delay Node Runtime

**Files:**
- Modify if needed: `supabase/functions/process-automations/graph-executor.ts`
- Modify if needed: `supabase/functions/process-scheduled-executions/index.ts`
- Modify if needed: `supabase/functions/scheduler-tick/index.ts`

- [ ] **Step 1: Read current delay scheduling code**

Run:

```powershell
rg "action_delay|scheduled_executions|resume|delay" supabase/functions/process-automations supabase/functions/process-scheduled-executions supabase/functions/scheduler-tick
```

Expected: matches show where a delay node creates a scheduled execution and where the scheduled runner resumes graph execution.

- [ ] **Step 2: Create a minimal live canvas workflow for delay testing**

In the app UI, create an active canvas automation:

```text
New Comment -> Delay 1 minute -> Reply to Comment
```

Use a static reply message:

```text
Delay test reply from SwiftFlow
```

This test uses the working Instagram comment webhook path and isolates delay from AI availability.

- [ ] **Step 3: Trigger a real Instagram comment**

Add a comment to the selected Instagram post and wait at least two scheduler ticks. Because `scheduler-tick` runs every minute, allow up to 3 minutes before declaring the delay failed.

- [ ] **Step 4: Inspect Supabase rows if reply is missing**

Use the Supabase dashboard or SQL editor and inspect:

```sql
select id, status, trigger_type, created_at, completed_at, error
from automation_runs
where automation_id = '<automation-id>'
order by created_at desc
limit 5;

select id, status, run_id, scheduled_for, executed_at, error
from scheduled_executions
where run_id = '<run-id>'
order by scheduled_for desc
limit 5;
```

Expected for a working delay:
- `automation_runs.status` reaches `completed`.
- `scheduled_executions.status` moves from `pending` to `completed`.
- The comment receives the static reply after the delay.

- [ ] **Step 5: Fix only the observed failure**

If the scheduled row stays `pending`, fix `supabase/functions/scheduler-tick/index.ts` or `supabase/functions/process-scheduled-executions/index.ts` so due rows invoke the resume function.

If the scheduled row completes but downstream reply does not run, fix `supabase/functions/process-automations/graph-executor.ts` so the resume payload includes the original trigger context and the next node after the delay.

Use this invariant in the fix:

```ts
// A resumed delay must continue from the outgoing edge target of the delay node
// with the original trigger context and previous node outputs available.
```

- [ ] **Step 6: Redeploy changed Edge Functions**

Run only the functions changed by the fix. Examples:

```powershell
supabase functions deploy process-automations --project-ref txomrdymcawauezlprvn
supabase functions deploy process-scheduled-executions --project-ref txomrdymcawauezlprvn
supabase functions deploy scheduler-tick --project-ref txomrdymcawauezlprvn
```

Expected: Supabase CLI reports each function deployed successfully.

- [ ] **Step 7: Retest the same delay workflow**

Repeat Steps 3 and 4. Expected: reply appears after the configured delay and both run tables show completed states.

- [ ] **Step 8: Commit**

Run:

```powershell
git add supabase/functions/process-automations supabase/functions/process-scheduled-executions supabase/functions/scheduler-tick
git commit -m "Restore delay node resume execution"
```

---

### Task 7: Verify Page Build And Production Deploy

**Files:**
- No source edits unless verification finds a real defect.

- [ ] **Step 1: Run repo validation**

Run:

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint app/dashboard/automation/page.tsx components/automation/automation-template-picker.tsx components/automation/canvas types/automation-graph.ts app/api/automations/validate/route.ts
```

Expected: touched files pass. If repo-wide unrelated lint debt appears, record the exact unrelated files and do not change them in this branch.

- [ ] **Step 2: Build locally**

Run:

```powershell
pnpm run build
```

Expected: Next.js build succeeds. If env validation fails because local production env variables are not present, run `pnpm exec tsc --noEmit` and document the missing env variable instead of changing env validation.

- [ ] **Step 3: Commit any verification fixes**

If Step 1 or 2 required a source fix, commit it:

```powershell
git add <fixed-files>
git commit -m "Fix automation canvas verification issues"
```

- [ ] **Step 4: Push master**

Run:

```powershell
git push origin master
```

Expected: push succeeds and Vercel starts a production deployment from `master`.

- [ ] **Step 5: Smoke test production**

In production:

```text
Automation -> New Automation -> Start From Template -> Load Canvas
```

Expected:
- Canvas opens with a prebuilt node graph.
- Save and Active controls are visible on desktop and mobile widths.
- Existing active comment reply automation still fires from webhooks.
- Delay test automation replies after the configured delay.

---

## Self-Review

- Spec coverage: The plan removes the new wizard/form templates, keeps old canvas presets, makes the canvas the single engagement editor, improves mobile canvas controls, validates delay behavior, and gates trigger nodes against live webhook support.
- No red-flag placeholders: Each task lists exact files, commands, and expected results. The only conditional work is the delay runtime fix, which depends on the observed live failure mode and names the specific files for each failure class.
- Type consistency: The plan uses existing names: `WorkflowCanvas`, `AutomationTemplatePicker`, `AutomationTemplateDefinition`, `WorkflowGraph`, `NODE_CATALOG`, `TriggerNodeType`, `action_delay`, `trigger_new_comment`, `trigger_new_message`, `trigger_story_reply`, and `trigger_story_mention`.
