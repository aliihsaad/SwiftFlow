// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callTelegramBotApi,
  constantTimeEqual,
  loadTelegramWorkspaceConnection,
} from "../_shared/automation-telegram.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseDecision(
  data: unknown,
): { decision: "approved" | "rejected"; requestId: string } | null {
  const match =
    /^sf:([ar]):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      String(data || ""),
    );
  if (!match) return null;
  return {
    decision: match[1] === "a" ? "approved" : "rejected",
    requestId: match[2]!,
  };
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const url = new URL(req.url);
  const workspaceId = String(url.searchParams.get("workspace_id") || "").trim();
  if (!workspaceId) return json({ ok: false }, 404);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const connection = await loadTelegramWorkspaceConnection(
      supabase,
      workspaceId,
    );
    const presentedSecret =
      req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!constantTimeEqual(presentedSecret, connection.webhookSecret)) {
      return json({ ok: false }, 401);
    }

    const update = await req.json();
    const callback = update?.callback_query;
    const parsed = parseDecision(callback?.data);
    if (!callback?.id || !parsed) return json({ ok: true });

    const callbackChatId = String(callback?.message?.chat?.id || "");
    const callbackUserId = String(callback?.from?.id || "");
    if (
      callbackChatId !== connection.chatId ||
      callbackUserId !== connection.chatId
    ) {
      await callTelegramBotApi(connection.botToken, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "This approval belongs to a different SwiftFlow owner.",
        show_alert: true,
      }).catch(() => null);
      return json({ ok: true });
    }

    const { data, error } = await supabase.rpc(
      "resolve_telegram_approval_request",
      {
        p_request_id: parsed.requestId,
        p_workspace_id: workspaceId,
        p_decision: parsed.decision,
        p_telegram_user_id: callbackUserId,
      },
    );

    const resolution = Array.isArray(data) ? data[0] : data;
    const status = String(resolution?.resolution_status || "");
    if (error || !status) {
      await callTelegramBotApi(connection.botToken, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "This approval is unavailable or has already been removed.",
        show_alert: true,
      }).catch(() => null);
      return json({ ok: true });
    }

    const label =
      status === "approved"
        ? "Approved"
        : status === "expired"
          ? "Expired"
          : status === "rejected"
            ? "Rejected"
            : status;

    await callTelegramBotApi(connection.botToken, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `SwiftFlow: ${label}`,
      show_alert: false,
    }).catch(() => null);

    const originalText = String(
      callback?.message?.text || "SwiftFlow approval",
    );
    const icon =
      status === "approved" ? "✅" : status === "expired" ? "⌛" : "❌";
    await callTelegramBotApi(connection.botToken, "editMessageText", {
      chat_id: connection.chatId,
      message_id: callback?.message?.message_id,
      text: `${originalText}\n\n${icon} ${label}`,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => null);

    return json({ ok: true });
  } catch {
    // Telegram retries non-2xx webhook responses. A verified update that cannot
    // be processed safely is acknowledged and remains fail-closed in SwiftFlow.
    return json({ ok: true });
  }
});
