"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  boundTelegramMessage,
  buildTelegramWebhookUrl,
  callTelegramBotApi,
  normalizeTelegramBotToken,
  normalizeTelegramChatId,
  telegramChatLabel,
  type TelegramBotIdentity,
  type TelegramChatIdentity,
} from "@/lib/telegram-bot";
import { encryptSecret } from "@/lib/secret-crypto";
import { getWorkspaceSettingsWithSecrets } from "@/lib/workspace-settings";
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils";
import { requireWorkspacePermission } from "@/lib/workspace-permissions";
import { createClient } from "@/utils/supabase/server";

export type TelegramIntegrationResult = {
  success: boolean;
  botUsername?: string | null;
  botName?: string | null;
  chatLabel?: string | null;
  verifiedAt?: string | null;
  error?: string;
};

type TelegramSettingsInput = {
  botToken?: string;
  chatId?: string;
};

async function requireTelegramSettingsContext() {
  const activeWorkspace = await getExplicitActiveWorkspace();
  if (!activeWorkspace) {
    throw new Error(
      "No active workspace. Create or switch to a workspace first.",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await requireWorkspacePermission(
    supabase,
    user.id,
    activeWorkspace.id,
    "settings:write",
  );
  return { activeWorkspace, supabase };
}

function createWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function connectTelegramIntegration(
  input: TelegramSettingsInput,
): Promise<TelegramIntegrationResult> {
  try {
    const { activeWorkspace, supabase } =
      await requireTelegramSettingsContext();
    const current = await getWorkspaceSettingsWithSecrets(activeWorkspace.id);

    const botToken = normalizeTelegramBotToken(
      input.botToken?.trim() || current?.telegram_bot_token,
    );
    const chatId = normalizeTelegramChatId(
      input.chatId?.trim() || current?.telegram_chat_id,
    );
    const webhookSecret =
      current?.telegram_webhook_secret || createWebhookSecret();

    const [bot, chat] = await Promise.all([
      callTelegramBotApi<TelegramBotIdentity>(botToken, "getMe"),
      callTelegramBotApi<TelegramChatIdentity>(botToken, "getChat", {
        chat_id: chatId,
      }),
    ]);

    if (!bot.is_bot)
      throw new Error("The supplied Telegram token does not belong to a bot");
    if (String(chat.id) !== chatId)
      throw new Error(
        "Telegram returned a different chat than the configured chat ID",
      );
    if (chat.type !== "private") {
      throw new Error(
        "Telegram approval gates currently require a private chat with the bot",
      );
    }

    await callTelegramBotApi<boolean>(botToken, "setWebhook", {
      url: buildTelegramWebhookUrl(activeWorkspace.id),
      secret_token: webhookSecret,
      allowed_updates: ["callback_query"],
      drop_pending_updates: false,
    });

    const verifiedAt = new Date().toISOString();
    const { error } = await supabase.from("workspace_settings").upsert(
      {
        workspace_id: activeWorkspace.id,
        telegram_bot_token: encryptSecret(botToken),
        telegram_chat_id: encryptSecret(chatId),
        telegram_webhook_secret: encryptSecret(webhookSecret),
        telegram_bot_id: String(bot.id),
        telegram_bot_username: bot.username || null,
        telegram_bot_name: bot.first_name || null,
        telegram_verified_at: verifiedAt,
        updated_at: verifiedAt,
      },
      { onConflict: "workspace_id" },
    );

    if (error)
      throw new Error(
        "Telegram was verified, but SwiftFlow could not save the integration",
      );

    revalidatePath("/dashboard/settings");
    return {
      success: true,
      botUsername: bot.username || null,
      botName: bot.first_name || null,
      chatLabel: telegramChatLabel(chat),
      verifiedAt,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to connect Telegram",
    };
  }
}

export async function testTelegramIntegration(): Promise<TelegramIntegrationResult> {
  try {
    const { activeWorkspace } = await requireTelegramSettingsContext();
    const current = await getWorkspaceSettingsWithSecrets(activeWorkspace.id);
    const botToken = normalizeTelegramBotToken(current?.telegram_bot_token);
    const chatId = normalizeTelegramChatId(current?.telegram_chat_id);

    await callTelegramBotApi(botToken, "sendMessage", {
      chat_id: chatId,
      text: boundTelegramMessage(
        `✅ SwiftFlow is connected to this chat. Notifications and approval requests are ready for ${activeWorkspace.name}.`,
      ),
      disable_web_page_preview: true,
    });

    return {
      success: true,
      botUsername: current?.telegram_bot_username || null,
      botName: current?.telegram_bot_name || null,
      verifiedAt: current?.telegram_verified_at || null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send a Telegram test message",
    };
  }
}

export async function removeTelegramIntegration(): Promise<TelegramIntegrationResult> {
  try {
    const { activeWorkspace, supabase } =
      await requireTelegramSettingsContext();
    const current = await getWorkspaceSettingsWithSecrets(activeWorkspace.id);

    if (current?.telegram_bot_token) {
      try {
        await callTelegramBotApi<boolean>(
          current.telegram_bot_token,
          "deleteWebhook",
          {
            drop_pending_updates: true,
          },
        );
      } catch {
        // Credential removal must remain possible when Telegram is unavailable
        // or a token has already been revoked.
      }
    }

    const { error } = await supabase
      .from("workspace_settings")
      .update({
        telegram_bot_token: null,
        telegram_chat_id: null,
        telegram_webhook_secret: null,
        telegram_bot_id: null,
        telegram_bot_username: null,
        telegram_bot_name: null,
        telegram_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", activeWorkspace.id);

    if (error) throw new Error("Failed to remove the Telegram integration");

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to remove Telegram",
    };
  }
}
