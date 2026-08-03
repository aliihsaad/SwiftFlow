import { describe, expect, it } from "vitest";

import { validateTelegramNodeConfigs } from "@/lib/automation-telegram-validation";
import { validateDeveloperAutomationGraph } from "@/lib/developer-api/automation-graph";
import type {
  ActionTelegramConfig,
  WorkflowGraph,
} from "@/types/automation-graph";
import { buildAutomationTelegramMessage } from "../../supabase/functions/_shared/automation-telegram.ts";

function telegramGraph(config: ActionTelegramConfig): WorkflowGraph {
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
        id: "telegram-owner",
        type: "action",
        position: { x: 240, y: 0 },
        data: {
          type: "action_telegram",
          label: "Ask owner",
          config,
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "trigger-comment",
        target: "telegram-owner",
      },
    ],
  };
}

describe("Telegram automation node", () => {
  it("accepts notification and approval configurations with bounded timeouts", () => {
    const notification = telegramGraph({
      mode: "notification",
      message_template: "",
      include_context: true,
    });
    const approval = telegramGraph({
      mode: "approval",
      message_template: "Review this AI reply",
      include_context: true,
      include_ai_response: true,
      approval_timeout_value: 7,
      approval_timeout_unit: "days",
    });

    expect(validateTelegramNodeConfigs(notification)).toEqual([]);
    expect(validateDeveloperAutomationGraph(notification).errors).toEqual([]);
    expect(validateTelegramNodeConfigs(approval)).toEqual([]);
    expect(validateDeveloperAutomationGraph(approval).errors).toEqual([]);
  });

  it("rejects empty messages, unsupported modes, and out-of-range approval timeouts", () => {
    const empty = telegramGraph({
      mode: "notification",
      message_template: "",
      include_context: false,
      include_ai_response: false,
    });
    const invalid = telegramGraph({
      mode: "approval",
      message_template: "Approve",
      approval_timeout_value: 169,
      approval_timeout_unit: "hours",
    });
    (invalid.nodes[1]!.data.config as unknown as Record<string, unknown>).mode =
      "broadcast";

    expect(validateTelegramNodeConfigs(empty)).toEqual([
      expect.objectContaining({
        code: "TELEGRAM_MESSAGE_EMPTY",
        nodeId: "telegram-owner",
      }),
    ]);
    expect(
      validateTelegramNodeConfigs(invalid).map((issue) => issue.code),
    ).toEqual(["TELEGRAM_MODE_INVALID"]);

    const timeout = telegramGraph({
      mode: "approval",
      message_template: "Approve",
      approval_timeout_value: 169,
      approval_timeout_unit: "hours",
    });
    expect(validateTelegramNodeConfigs(timeout)).toEqual([
      expect.objectContaining({
        code: "TELEGRAM_TIMEOUT_INVALID",
        nodeId: "telegram-owner",
      }),
    ]);
  });

  it("normalizes Developer API boolean and timeout values", () => {
    const graph = telegramGraph({
      mode: "approval",
      message_template: "Approve",
      include_context: true,
      approval_timeout_value: 30,
      approval_timeout_unit: "minutes",
    });
    graph.nodes[1]!.data.config = {
      mode: "approval",
      message_template: "Approve",
      include_context: "false",
      include_ai_response: "true",
      include_technical_details: "false",
      approval_timeout_value: "45",
      approval_timeout_unit: "minutes",
    } as unknown as ActionTelegramConfig;

    const result = validateDeveloperAutomationGraph(graph);
    const config = result.graph?.nodes[1]?.data.config as unknown as Record<
      string,
      unknown
    >;

    expect(result.errors).toEqual([]);
    expect(config).toMatchObject({
      include_context: false,
      include_ai_response: true,
      include_technical_details: false,
      approval_timeout_value: 45,
    });
  });

  it("builds an AI-only approval message when general context is disabled", () => {
    const message = buildAutomationTelegramMessage({
      config: {
        mode: "approval",
        message_template: "",
        include_context: false,
        include_ai_response: true,
      },
      context: {
        ai_response: "Thanks for reaching out — I can help with that.",
      },
      approval: true,
    });

    expect(message).toContain("SwiftFlow approval required");
    expect(message).toContain("AI output");
    expect(message).toContain(
      "Thanks for reaching out — I can help with that.",
    );
  });

  it("includes bounded context while redacting credential-shaped fields", () => {
    const message = buildAutomationTelegramMessage({
      config: {
        mode: "notification",
        message_template: "Automation needs attention.",
        include_context: true,
        include_technical_details: true,
      },
      context: {
        comment_text: "Please send pricing",
        commenter_username: "alice",
        access_token: "telegram-must-not-leak",
      },
      automation: {
        id: "automation-1",
        name: "Comment assistant",
        workspace_id: "workspace-1",
      },
    });

    expect(message).toContain("Automation needs attention.");
    expect(message).toContain("Please send pricing");
    expect(message).toContain("[redacted]");
    expect(message).not.toContain("telegram-must-not-leak");
    expect(message.length).toBeLessThanOrEqual(4096);
  });
});
