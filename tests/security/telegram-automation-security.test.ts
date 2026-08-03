import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "@/supabase/functions/_shared/automation-telegram";

const root = process.cwd();

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8");
}

describe("Telegram automation security", () => {
  it("keeps Telegram credentials encrypted and server-only", () => {
    const action = source("app", "actions", "telegram-settings.ts");
    const settingsAction = source("app", "actions", "settings.ts");

    expect(action).toContain("encryptSecret(botToken)");
    expect(action).toContain("encryptSecret(chatId)");
    expect(action).toContain("encryptSecret(webhookSecret)");
    expect(action).toContain('"settings:write"');
    expect(action).toContain('chat.type !== "private"');
    expect(settingsAction).toContain("has_telegram_bot_token");
    expect(settingsAction).toContain("telegram_chat_id_hint");
    expect(settingsAction).toContain("telegram_bot_token: null");
    expect(settingsAction).toContain("telegram_webhook_secret: null");
  });

  it("uses service-role-only durable approvals and pinned workflow versions", () => {
    const migration = source(
      "supabase",
      "migrations",
      "20260803120000_add_telegram_automation_approvals.sql",
    );

    expect(migration).toContain(
      "alter table public.automation_approval_requests enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.automation_approval_requests from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.automation_approval_requests to service_role",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_request.status <> 'pending'");
    expect(migration).toContain("workflow_version_id");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain(
      "grant execute on function public.resolve_telegram_approval_request",
    );
  });

  it("authenticates webhook callbacks and binds them to the private owner chat", () => {
    const webhook = source(
      "supabase",
      "functions",
      "telegram-automation-webhook",
      "index.ts",
    );

    expect(webhook).toContain("x-telegram-bot-api-secret-token");
    expect(webhook).toContain(
      "constantTimeEqual(presentedSecret, connection.webhookSecret)",
    );
    expect(webhook).toContain("callbackChatId !== connection.chatId");
    expect(webhook).toContain("callbackUserId !== connection.chatId");
    expect(webhook).toContain("resolve_telegram_approval_request");
    expect(webhook).toMatch(/\^sf:\(\[ar\]\):/);
  });

  it("persists approvals before sending single-use inline buttons", () => {
    const worker = source(
      "supabase",
      "functions",
      "automation-worker-telegram",
      "index.ts",
    );
    const insertAt = worker.indexOf('.from("automation_approval_requests")');
    const buttonsAt = worker.indexOf("inline_keyboard");

    expect(insertAt).toBeGreaterThan(-1);
    expect(buttonsAt).toBeGreaterThan(insertAt);
    expect(worker).toContain("awaiting_approval: true");
    expect(worker).toContain("callback_data: `sf:a:${requestId}`");
    expect(worker).toContain("callback_data: `sf:r:${requestId}`");
  });

  it("compares webhook secrets without early-return timing differences", () => {
    expect(constantTimeEqual("same-secret", "same-secret")).toBe(true);
    expect(constantTimeEqual("same-secret", "wrong-secret")).toBe(false);
    expect(constantTimeEqual("short", "a-much-longer-secret")).toBe(false);
  });
});
