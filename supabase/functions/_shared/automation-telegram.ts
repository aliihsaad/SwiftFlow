// @ts-nocheck - Shared by Deno Edge Functions and Node tests
import { buildAutomationEmailMessage } from "./automation-email.ts";
import { decryptSecretIfNeeded } from "./secret-crypto.ts";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_MESSAGE_LIMIT = 4096;

export interface TelegramWorkspaceConnection {
  botToken: string;
  chatId: string;
  webhookSecret: string;
  botUsername: string | null;
}

export async function loadTelegramWorkspaceConnection(
  supabase: any,
  workspaceId: string,
): Promise<TelegramWorkspaceConnection> {
  if (!workspaceId) throw new Error("Telegram workspace is missing");

  const { data, error } = await supabase
    .from("workspace_settings")
    .select(
      "telegram_bot_token, telegram_chat_id, telegram_webhook_secret, telegram_bot_username, telegram_verified_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error("Telegram settings could not be loaded");
  if (!data?.telegram_verified_at)
    throw new Error("Telegram is not connected for this workspace");

  const [botToken, chatId, webhookSecret] = await Promise.all([
    decryptSecretIfNeeded(data.telegram_bot_token),
    decryptSecretIfNeeded(data.telegram_chat_id),
    decryptSecretIfNeeded(data.telegram_webhook_secret),
  ]);

  if (!botToken || !chatId || !webhookSecret) {
    throw new Error("Telegram connection is incomplete");
  }

  return {
    botToken,
    chatId,
    webhookSecret,
    botUsername: data.telegram_bot_username || null,
  };
}

export async function callTelegramBotApi<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok || body?.ok !== true) {
      const description =
        typeof body?.description === "string"
          ? body.description.replace(/bot\d+:[A-Za-z0-9_-]+/g, "[redacted bot]")
          : "Telegram rejected the request";
      throw new Error(description);
    }

    return body.result as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Telegram request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildAutomationTelegramMessage(input: {
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  automation?: Record<string, unknown>;
  node?: Record<string, unknown>;
  approval?: boolean;
}): string {
  const config = input.config || {};
  const context = { ...(input.context || {}) };

  if (config.include_ai_response === false) {
    delete context.ai_response;
  }

  const includeContext = config.include_context !== false;
  const includeAiResponse = config.include_ai_response !== false;
  const aiOnlyBlock =
    !includeContext &&
    includeAiResponse &&
    String(context.ai_response || "").trim()
      ? "AI output\n- Response: {{ai_response}}"
      : "";
  const body = [String(config.message_template || "").trim(), aiOnlyBlock]
    .filter(Boolean)
    .join("\n\n");

  const built = buildAutomationEmailMessage({
    config: {
      body,
      include_context: includeContext,
      include_technical_details: config.include_technical_details === true,
    },
    context,
    automation: input.automation,
    node: input.node,
    platform: String(context.platform || ""),
  });

  const heading = input.approval
    ? "SwiftFlow approval required"
    : "SwiftFlow automation update";
  const message = [heading, built.text].filter(Boolean).join("\n\n").trim();
  if (message.length <= TELEGRAM_MESSAGE_LIMIT) return message;

  return `${message.slice(0, TELEGRAM_MESSAGE_LIMIT - 28).trim()}\n\n[message truncated]`;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;

  for (let index = 0; index < length; index++) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }

  return difference === 0;
}
