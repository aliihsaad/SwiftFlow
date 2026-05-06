# Mobile-Friendly Automation Wizard Design

Date: 2026-05-06

## Decision

The automation product should become wizard-first and graph-backed.

The visual workflow canvas remains useful as an advanced/internal editor, but it should not be the primary automation builder. Mobile and reviewer-facing automation creation should use a structured wizard that generates the same `workflow_graph` shape consumed by the existing execution engine.

## Problem

The current canvas builder is not mobile-friendly:

- Nodes are too large for small screens.
- Dragging, positioning, and connecting nodes is awkward on touch devices.
- Reviewers and normal users must understand graph mechanics before they can create a basic automation.
- The Automation page currently mixes publishing automation with comments/messages engagement automation, which increases Meta review risk.

The product goal is not to make users manually connect logic. The goal is to let users describe a safe automation and have the app build the underlying graph.

## Core Principle

Do not replace the automation engine. Replace the default builder UX.

The wizard must save automations using the existing `workflow_graph` model whenever possible. That keeps:

- `supabase/functions/process-automations/graph-executor.ts`
- existing node worker functions
- `automation_runs`
- delay handling
- condition handling
- logs and counters
- future advanced canvas compatibility

## Existing Node Coverage

The wizard should cover every node currently defined in `types/automation-graph.ts`.

### Triggers

- `trigger_new_comment`
- `trigger_new_message`
- `trigger_new_follower`
- `trigger_cron`
- `trigger_story_mention`
- `trigger_story_reply`

### Actions

- `action_ai_response`
- `action_reply_comment`
- `action_send_dm`
- `action_private_reply`
- `action_delay`
- `action_condition`
- `action_send_email`
- `action_http_request`

Some nodes can be supported but hidden behind stage gates when the related permission or runtime path is not ready.

## Recommended UX

### Entry Choice

The Automation page should first separate automation families:

- Publishing automations
- Engagement automations
- Advanced visual builder

Publishing automations stay available under publishing permissions. Engagement automations remain gated until comments/messages permissions are approved and stable.

### Wizard Flow

The wizard uses a step stack, not a node canvas:

1. Automation family
2. Trigger
3. Account and target
4. Filters / conditions
5. AI response options
6. Actions
7. Delay and fallback behavior
8. Review and activate

The review screen must show a plain-English summary, for example:

> When someone comments with "price" on this Instagram post, wait 2 minutes, generate a friendly AI response, reply publicly, then send a DM with the link.

## Graph Mapping

The wizard should compile user choices into deterministic graph nodes and edges.

Basic example:

```text
trigger_new_comment -> action_ai_response -> action_reply_comment -> action_send_dm
```

With delay:

```text
trigger_new_message -> action_delay -> action_ai_response -> action_send_dm
```

With condition:

```text
trigger_new_comment -> action_condition
action_condition:true -> action_ai_response -> action_reply_comment
action_condition:false -> action_send_email
```

The compiler should generate stable node IDs, labels, configs, and edges. It should not depend on visual coordinates for execution.

## Mobile Behavior

On mobile, the wizard should behave like a dense settings flow:

- One major decision per screen.
- Sticky bottom actions: Back, Continue, Save Draft.
- Compact summaries between steps.
- No drag handles.
- No freeform graph canvas.
- Validation errors shown beside the exact field.

Advanced action settings such as HTTP headers, email body, AI prompt override, CTA fallback, and condition thresholds can open as nested sheets/sections.

## Permission Gates

The wizard must be permission-aware before save and before activation.

Examples:

- Comment trigger on Instagram requires `instagram_manage_comments`.
- Facebook comment read can use `pages_read_engagement`.
- Facebook comment management requires a decision on `pages_manage_engagement`.
- Instagram messages require `instagram_manage_messages`.
- Facebook/Page messages require `pages_messaging`.
- Publishing automations require `pages_manage_posts` or `instagram_content_publish`.

If a permission is unavailable, the wizard can show the step as locked with a reconnect/review-stage explanation, but it should not let the user create an automation that cannot run.

## Stage Gates

### Stage 1: Publishing Automation

Keep the existing publishing automation wizard and improve schedule controls later. It remains separate from engagement automation.

### Stage 2: Engagement Wizard Shell

Add the new graph-backed wizard shell and read-only/gated templates. This can be built without exposing unapproved permissions.

### Stage 3: Comments

Enable comment trigger and comment reply actions only for approved platforms/scopes.

### Stage 4: Messages

Enable message trigger, send DM, and private reply only after messaging permissions and webhooks are approved and tested.

### Stage 5: Advanced Builder

Keep the visual builder as "Advanced visual editor" for desktop users or internal operators. It should be optional, not the default path.

## Data Model

No immediate database replacement is needed.

Use current fields:

- `automations.workflow_graph`
- `automations.editor_version`
- existing legacy columns for compatibility where still required

Recommended new convention:

- Wizard-generated graph automations should use `editor_version = "wizard"` or a future explicit value such as `wizard_graph`.
- If the existing enum only supports `wizard | canvas`, preserve compatibility first and document that new wizard records are graph-backed wizard records.

## Implementation Units

1. `AutomationWizardState`
   - Stores selected family, trigger, account, filters, actions, delays, and advanced options.

2. `automation-wizard-compiler`
   - Converts wizard state into `WorkflowGraph`.
   - Owns node ID generation, labels, default configs, and edge ordering.

3. `automation-permission-rules`
   - Maps trigger/action choices to required Meta capabilities.
   - Used by wizard UI, API validation, and activation checks.

4. `AutomationWizard`
   - Mobile-friendly UI shell.
   - Uses existing API routes where possible.

5. `AdvancedVisualEditor`
   - Existing canvas, moved behind an advanced entry point.

## Validation

Validation must happen in three places:

- Client wizard validation before advancing steps.
- API validation before save.
- Runtime validation before activation/execution.

The most important rule: users should not be able to activate an automation if its selected account lacks the required capability.

## Testing

Minimum test coverage:

- Wizard compiler generates valid graph for each supported template.
- Permission rules return correct required scopes for each trigger/action pair.
- Existing graph executor accepts wizard-generated graphs.
- Mobile layout does not require horizontal canvas movement.
- Engagement automations stay gated when review/permission stage is not enabled.

## Open Follow-Up

The visual builder can remain available as an advanced mode, but we should decide later whether it is:

- visible only on desktop,
- hidden behind a feature flag,
- or available only to admins/internal users.

Default product behavior should remain wizard-first.
