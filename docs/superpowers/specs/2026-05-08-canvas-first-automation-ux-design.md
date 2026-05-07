# Canvas-First Automation UX Design

Date: 2026-05-08
Project: Social-Media-Manager-AI-Tool

## Decision

The automation product returns to a canvas-first model.

The visual workflow builder is the only real editor for engagement automations. The newer form-based automation wizard and template wizard flow will be removed from the product surface. Canvas templates remain and become the main quick-start path: templates load ready node workflows into the visual builder, then users configure the nodes directly.

## Why

Live testing showed that automations created through the newer wizard path can behave differently from the same automation created in the visual workflow builder. That makes the system harder to test, debug, and explain during Meta permission review.

The canvas path already works for the validated Instagram AI comment reply flow. Keeping one graph editor and one graph execution mental model reduces product and engineering risk.

## Product Model

1. `New Automation` opens the canvas-oriented creation flow.
2. Users can start from canvas templates/presets or start blank.
3. A template inserts a ready workflow graph into the visual builder.
4. Users configure accounts, posts, messages, AI settings, delays, and actions from node config panels.
5. Editing any existing automation always opens the visual canvas.
6. The removed wizard path must not be used for create or edit.

## Keep

- Existing visual workflow builder.
- Existing canvas template picker behavior.
- Canvas templates that load node sets.
- Graph executor and node workers.
- Delay node as an advanced canvas node, pending reliability validation.
- Publishing automation wizard remains separate from engagement automations.

## Remove

- Form-based template wizard modal.
- New template gallery as the default creation path when it bypasses direct canvas editing.
- Generic guided graph wizard for engagement automation creation.
- Wizard-based editing for existing automations.
- Wizard-only domain modules and UI components if no remaining code path uses them.

## Canvas Templates

Canvas templates are presets, not separate products.

Each template should:

- Build a complete `WorkflowGraph`.
- Use the same node types the canvas understands.
- Leave required account/post/message fields configurable in node panels.
- Prefer stable defaults and fallback messages.
- Avoid delay nodes until the delay execution path is confirmed stable.

Initial templates to keep or add:

- Instagram AI public reply to comments.
- Instagram comment to DM/private reply.
- Instagram DM AI auto-reply.
- Facebook Page comment public reply.
- Facebook comment to DM/private reply, if permission and API behavior validate.
- Story mention/reply workflow only after webhook payloads are confirmed.
- New follower workflow only after webhook support is confirmed.

## Trigger Nodes

Add or restore trigger nodes only when the webhook/event source can be validated with current permissions.

Candidate triggers:

- `trigger_new_comment`
- `trigger_new_message`
- `trigger_story_mention`
- `trigger_story_reply`
- `trigger_new_follower`

Each trigger must have a clear source:

- Meta webhook field/event.
- Expected payload fields.
- Required permission.
- Supported platform.
- Test procedure.

Unvalidated triggers can exist in code behind an advanced or beta label, but they should not be promoted in templates.

## Delay Node

The delay node stays as an advanced canvas node because it previously worked before the Meta review permission reduction period. It needs a focused reliability pass.

Delay validation must cover:

- Scheduling a resume row.
- `scheduler-tick` picking up the due execution.
- `process-scheduled-executions` resuming the correct remaining nodes.
- Preserving trigger context and node outputs.
- Marking run/node status accurately.

Until that is verified, templates should not depend on delay.

## Mobile Canvas UX

Mobile support should make the canvas usable for template-based edits, not turn mobile into a full complex workflow construction surface.

Required UX changes:

- Sticky bottom action bar with Save, Activate/Pause, and Test where applicable.
- Node cards shrink on narrow screens.
- Canvas helper text becomes shorter on mobile.
- Zoom controls are easier to reach and do not hide the graph.
- Config panel opens as a bottom sheet or full-height drawer on mobile.
- Template picker remains easy to open from the canvas.
- Important actions must stay visible after selecting a node.

## UI Entry Points

Automation page should emphasize:

- Start from template.
- Open visual builder.
- View existing automations.

It should not present the removed wizard as a primary or secondary path.

The old form wizard can be deleted outright. If deletion is risky in one pass, the implementation may first remove imports/routes/entry points, then delete dead files after TypeScript confirms they are unused.

## Data Flow

All engagement automations should converge on:

1. `WorkflowGraph` stored on `automations.workflow_graph`.
2. Canvas editor reads/writes that graph.
3. Webhooks or scheduler create automation events/runs.
4. `automation-worker-run` executes the graph.
5. Worker functions execute node actions.
6. `automation_runs` and `automation_node_runs` record status and errors.

No separate wizard execution semantics should remain.

## Testing

Minimum validation:

- Existing Instagram AI comment reply still works.
- Canvas template loads and saves a valid graph.
- Editing a template-created automation opens the canvas.
- New automation entry no longer opens the removed wizard.
- Mobile viewport exposes Save/Activate/Test without horizontal layout breakage.
- Delay node resume path is tested separately before delay templates are promoted.

## Out of Scope

- Redesigning publishing automations.
- Adding unapproved Meta permission flows.
- Making mobile canvas perfect for heavy graph building.
- Reworking the graph executor architecture beyond fixes needed for delay and validated triggers.

## Migration

Existing automations created by the removed wizard should remain usable if they have a valid `workflow_graph`. Editing them should open the canvas.

If an automation has wizard-only metadata, the canvas should ignore it unless needed for display. The source of truth is the graph.
