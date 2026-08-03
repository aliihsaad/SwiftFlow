import "server-only";

const TELEGRAM_API_ROOT = "https://api.telegram.org";
const TELEGRAM_MESSAGE_LIMIT = 4096;

export type TelegramBotIdentity = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramChatIdentity = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  first_name?: string;
  last_name?: string;
  username?: string;
  title?: string;
};

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

function safeTelegramError(
  method: string,
  payload: TelegramEnvelope<unknown>,
  status: number,
): Error {
  const description = String(
    payload.description || "Telegram rejected the request",
  )
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
    .slice(0, 300);
  return new Error(
    `Telegram ${method} failed (${payload.error_code || status}): ${description}`,
  );
}

export async function callTelegramBotApi<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `${TELEGRAM_API_ROOT}/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  let payload: TelegramEnvelope<T>;
  try {
    payload = (await response.json()) as TelegramEnvelope<T>;
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response`);
  }

  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw safeTelegramError(method, payload, response.status);
  }

  return payload.result;
}

export function normalizeTelegramBotToken(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Enter a valid Telegram bot token from BotFather");
  }
  return token;
}

export function normalizeTelegramChatId(value: unknown): string {
  const chatId = typeof value === "string" ? value.trim() : "";
  if (!/^-?\d{5,20}$/.test(chatId)) {
    throw new Error("Enter a valid numeric Telegram chat ID");
  }
  return chatId;
}

export function buildTelegramWebhookUrl(workspaceId: string): string {
  const supabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  ).replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Supabase URL is not configured");
  return `${supabaseUrl}/functions/v1/telegram-automation-webhook?workspace_id=${encodeURIComponent(workspaceId)}`;
}

export function telegramChatLabel(chat: TelegramChatIdentity): string {
  if (chat.username) return `@${chat.username}`;
  const privateName = [chat.first_name, chat.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return privateName || chat.title || "Private chat";
}

export function boundTelegramMessage(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, TELEGRAM_MESSAGE_LIMIT);
}
