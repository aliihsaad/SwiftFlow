import { describe, expect, it } from "vitest"

import { validateSendEmailNodeConfigs } from "@/lib/automation-send-email-validation"
import { validateDeveloperAutomationGraph } from "@/lib/developer-api/automation-graph"
import type { ActionSendEmailConfig, WorkflowGraph } from "@/types/automation-graph"
import { buildAutomationEmailMessage } from "../../supabase/functions/_shared/automation-email.ts"

function emailGraph(config: ActionSendEmailConfig): WorkflowGraph {
  return {
    nodes: [
      {
        id: "trigger-comment",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger_new_comment",
          label: "New Comment",
          config: {
            social_account_id: "account-1",
            post_id: "17895695668004550",
            trigger_type: "any",
            keywords: [],
          },
        },
      },
      {
        id: "notify-team",
        type: "action",
        position: { x: 240, y: 0 },
        data: {
          type: "action_send_email",
          label: "Notify team",
          config,
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-comment", target: "notify-team" },
    ],
  }
}

describe("automation email context", () => {
  it("allows context-enabled Send Email nodes to omit a manual body", () => {
    const graph = emailGraph({
      recipient_type: "custom",
      recipient_email: "alerts@example.com",
      subject: "SwiftFlow alert",
      body: "",
      include_context: true,
    })

    expect(validateSendEmailNodeConfigs(graph).map((issue) => issue.code)).not.toContain("SEND_EMAIL_BODY_REQUIRED")
    expect(validateDeveloperAutomationGraph(graph).errors).toEqual([])
  })

  it("requires a manual body when automation context is disabled", () => {
    const graph = emailGraph({
      recipient_type: "custom",
      recipient_email: "alerts@example.com",
      subject: "SwiftFlow alert",
      body: "",
      include_context: false,
    })

    expect(validateSendEmailNodeConfigs(graph)).toEqual([
      expect.objectContaining({
        code: "SEND_EMAIL_BODY_REQUIRED",
        nodeId: "notify-team",
      }),
    ])
    expect(validateDeveloperAutomationGraph(graph).errors).toEqual([
      expect.objectContaining({
        code: "MISSING_FIELD",
        nodeId: "notify-team",
      }),
    ])
  })

  it("builds a context-rich comment notification with the custom body as an intro", () => {
    const email = buildAutomationEmailMessage({
      config: {
        subject: "Alert for {{automation_name}}",
        body: "Please review this conversation.",
      },
      context: {
        commenter_username: "alice",
        commenter_id: "1784",
        comment_id: "comment-1",
        post_id: "post-1",
        comment_text: "Can you send pricing?",
        timestamp: "2026-05-15T10:00:00.000Z",
      },
      automation: {
        id: "automation-1",
        name: "Comment monitor",
        workspace_id: "workspace-1",
      },
      node: {
        id: "email-1",
        data: {
          type: "action_send_email",
          label: "Notify team",
        },
      },
      platform: "instagram",
    })

    expect(email.subject).toBe("Alert for Comment monitor")
    expect(email.text).toContain("Please review this conversation.")
    expect(email.text).toContain("Trigger details")
    expect(email.text).toContain("Trigger: comment")
    expect(email.text).toContain("Username: alice")
    expect(email.text).toContain("Text: Can you send pricing?")
    expect(email.text).toContain("Post ID: post-1")
    expect(email.text).toContain("Automation: Comment monitor")
    expect(email.text).toContain("Node: Notify team")
  })

  it("adds failed-node details to alert emails and redacts sensitive values", () => {
    const email = buildAutomationEmailMessage({
      config: {
        subject: "{{alert_source_node_label}} failed: {{alert_error}}",
        body: "",
        include_context: true,
      },
      context: {
        sender_username: "bob",
        sender_id: "sender-1",
        message_id: "message-1",
        message_text: "Need help with setup",
        alert_source_node_id: "send-dm",
        alert_source_node_type: "action_send_dm",
        alert_source_node_label: "Send DM",
        alert_error: "Meta API rejected the DM",
        access_token: "secret-token",
      },
      automation: {
        id: "automation-2",
        name: "DM support",
        workspace_id: "workspace-1",
      },
      node: {
        id: "email-2",
        data: {
          type: "action_send_email",
          label: "Alert owner",
        },
      },
      platform: "instagram",
    })

    expect(email.subject).toBe("Send DM failed: Meta API rejected the DM")
    expect(email.text).toContain("Alert details")
    expect(email.text).toContain("Failed node: Send DM")
    expect(email.text).toContain("Failed node type: action_send_dm")
    expect(email.text).toContain("Error: Meta API rejected the DM")
    expect(email.text).toContain("Trigger: direct message")
    expect(email.text).toContain("Text: Need help with setup")
    expect(email.text).not.toContain("secret-token")
    expect(email.text).toContain("[redacted]")
  })
})
