import type { WorkflowGraph } from "@/types/automation-graph";

export type TelegramNodeValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
};

const MAX_TIMEOUT_BY_UNIT = {
  minutes: 10_080,
  hours: 168,
  days: 7,
} as const;

export function validateTelegramNodeConfigs(
  graph: WorkflowGraph | null | undefined,
): TelegramNodeValidationIssue[] {
  const issues: TelegramNodeValidationIssue[] = [];

  for (const node of graph?.nodes || []) {
    if (node.data?.type !== "action_telegram") continue;

    const config = (node.data.config || {}) as unknown as Record<
      string,
      unknown
    >;
    const mode = String(config.mode || "notification");
    const message =
      typeof config.message_template === "string"
        ? config.message_template.trim()
        : "";
    const includeContext = config.include_context !== false;
    const includeAiResponse = config.include_ai_response !== false;

    if (mode !== "notification" && mode !== "approval") {
      issues.push({
        code: "TELEGRAM_MODE_INVALID",
        message: "Telegram mode must be Notification or Approval gate.",
        nodeId: node.id,
      });
      continue;
    }

    if (!message && !includeContext && !includeAiResponse) {
      issues.push({
        code: "TELEGRAM_MESSAGE_EMPTY",
        message:
          "Telegram requires a message, automation context, or AI response.",
        nodeId: node.id,
      });
    }

    if (mode === "approval") {
      const unit = String(
        config.approval_timeout_unit || "minutes",
      ) as keyof typeof MAX_TIMEOUT_BY_UNIT;
      const value = Number(config.approval_timeout_value ?? 30);
      if (!(unit in MAX_TIMEOUT_BY_UNIT)) {
        issues.push({
          code: "TELEGRAM_TIMEOUT_UNIT_INVALID",
          message:
            "Telegram approval timeout must use minutes, hours, or days.",
          nodeId: node.id,
        });
      } else if (
        !Number.isFinite(value) ||
        value < 1 ||
        value > MAX_TIMEOUT_BY_UNIT[unit]
      ) {
        issues.push({
          code: "TELEGRAM_TIMEOUT_INVALID",
          message:
            "Telegram approval timeout must be between 1 minute and 7 days.",
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}
