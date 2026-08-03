"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircleMore,
  Send,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import {
  connectTelegramIntegration,
  removeTelegramIntegration,
  testTelegramIntegration,
} from "@/app/actions/telegram-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider";
import type { WorkspaceSettings } from "@/types/settings";

type TelegramSettingsFormProps = {
  settings: WorkspaceSettings | null;
};

export function TelegramSettingsForm({ settings }: TelegramSettingsFormProps) {
  const router = useRouter();
  const canEditSettings = useWorkspacePermission("settings:write");
  const [isPending, startTransition] = useTransition();
  const [showToken, setShowToken] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [connected, setConnected] = useState(
    Boolean(
      settings?.has_telegram_bot_token &&
      settings?.has_telegram_chat_id &&
      settings?.telegram_verified_at,
    ),
  );
  const [botUsername, setBotUsername] = useState(
    settings?.telegram_bot_username || null,
  );
  const [botName, setBotName] = useState(settings?.telegram_bot_name || null);
  const [verifiedAt, setVerifiedAt] = useState(
    settings?.telegram_verified_at || null,
  );
  const [chatHint, setChatHint] = useState(
    settings?.telegram_chat_id_hint || null,
  );

  const submitConnection = () => {
    if (!botToken.trim() && !settings?.has_telegram_bot_token && !connected) {
      toast.error("Enter the bot token from BotFather");
      return;
    }
    if (!chatId.trim() && !settings?.has_telegram_chat_id && !connected) {
      toast.error("Enter the numeric ID of your private Telegram chat");
      return;
    }

    startTransition(async () => {
      const result = await connectTelegramIntegration({
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        ...(chatId.trim() ? { chatId: chatId.trim() } : {}),
      });
      if (!result.success) {
        toast.error(result.error || "Telegram connection failed");
        return;
      }

      setConnected(true);
      setBotUsername(result.botUsername || null);
      setBotName(result.botName || null);
      setVerifiedAt(result.verifiedAt || new Date().toISOString());
      if (chatId.trim()) setChatHint(`••••${chatId.trim().slice(-4)}`);
      setBotToken("");
      setChatId("");
      setShowToken(false);
      toast.success("Telegram connected and approval webhook registered");
      router.refresh();
    });
  };

  const sendTest = () => {
    startTransition(async () => {
      const result = await testTelegramIntegration();
      if (!result.success) {
        toast.error(result.error || "Telegram test failed");
        return;
      }
      toast.success("Test notification sent to Telegram");
    });
  };

  const removeConnection = () => {
    startTransition(async () => {
      const result = await removeTelegramIntegration();
      if (!result.success) {
        toast.error(result.error || "Could not remove Telegram");
        return;
      }
      setConnected(false);
      setBotUsername(null);
      setBotName(null);
      setVerifiedAt(null);
      setChatHint(null);
      setBotToken("");
      setChatId("");
      toast.success("Telegram integration removed");
      router.refresh();
    });
  };

  const fieldClass =
    "h-11 border-white/10 bg-black/20 text-white/85 placeholder:text-white/25 focus-visible:border-cyan-300/25 focus-visible:ring-cyan-300/20";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-white/9 bg-white/[0.025]">
        <div className="grid gap-5 border-b border-white/8 p-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">
              <MessageCircleMore className="size-3.5" aria-hidden="true" />
              Human-in-the-loop channel
            </div>
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-white/92">
              Bring automation decisions into Telegram.
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Send operational notifications or pause a workflow until you
              approve or reject its next action. SwiftFlow verifies the bot,
              locks approvals to one private chat, and registers a signed
              callback webhook.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-4 ${connected ? "border-emerald-300/16 bg-emerald-300/[0.06]" : "border-white/8 bg-black/20"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`grid size-10 place-items-center rounded-xl border ${connected ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/8 bg-white/[0.04] text-white/40"}`}
              >
                <Bot className="size-5" aria-hidden="true" />
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${connected ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-amber-300/15 bg-amber-300/8 text-amber-100/75"}`}
              >
                {connected ? "Ready" : "Not connected"}
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold text-white/86">
              {connected
                ? botUsername
                  ? `@${botUsername}`
                  : botName || "Telegram bot"
                : "Telegram Bot API"}
            </p>
            <p className="mt-1 text-xs text-white/38">
              {connected
                ? `Private chat ${chatHint || "verified"} · callbacks secured`
                : "Connect a bot before adding Telegram nodes."}
            </p>
            {verifiedAt && (
              <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/28">
                Verified {new Date(verifiedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-6">
          <fieldset
            disabled={!canEditSettings || isPending}
            className="space-y-5 disabled:opacity-65"
          >
            {!canEditSettings && (
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-sm text-amber-100/80">
                Read-only access. An owner or admin must configure Telegram.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="telegram_bot_token" className="text-white/78">
                Bot token
              </Label>
              <div className="relative">
                <Input
                  id="telegram_bot_token"
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={botToken}
                  onChange={(event) => setBotToken(event.target.value)}
                  placeholder={
                    connected
                      ? "Saved securely — enter a token only to rotate it"
                      : "123456789:AA..."
                  }
                  className={`${fieldClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((value) => !value)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/35 transition hover:text-white/70"
                  aria-label={showToken ? "Hide bot token" : "Show bot token"}
                >
                  {showToken ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs leading-5 text-white/38">
                Create the bot with{" "}
                <span className="font-medium text-white/60">@BotFather</span>.
                The token is AES-GCM encrypted before storage and is never
                returned to this page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram_chat_id" className="text-white/78">
                Private chat ID
              </Label>
              <Input
                id="telegram_chat_id"
                inputMode="numeric"
                autoComplete="off"
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                placeholder={
                  connected
                    ? `Saved as ${chatHint || "a verified private chat"}`
                    : "Your numeric Telegram user/chat ID"
                }
                className={fieldClass}
              />
              <p className="text-xs leading-5 text-white/38">
                Open your bot in Telegram and send{" "}
                <span className="font-medium text-white/60">/start</span> first.
                Approval buttons are restricted to this private chat and its
                Telegram user.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                onClick={submitConnection}
                disabled={!canEditSettings || isPending}
                className="h-11 bg-gradient-to-r from-cyan-400 to-violet-500 px-5 font-semibold text-slate-950 hover:from-cyan-300 hover:to-violet-400"
              >
                {isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 size-4" />
                )}
                {connected ? "Verify or rotate" : "Connect & verify"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={sendTest}
                disabled={!connected || !canEditSettings || isPending}
                className="h-11 border-white/10 bg-white/[0.035] text-white/78 hover:bg-white/[0.07] hover:text-white"
              >
                <Send className="mr-2 size-4" />
                Send test
              </Button>
              {connected && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={removeConnection}
                  disabled={!canEditSettings || isPending}
                  className="h-11 text-rose-200/80 hover:bg-rose-300/[0.08] hover:text-rose-100"
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove
                </Button>
              )}
            </div>
          </fieldset>

          <aside className="space-y-3">
            {[
              {
                icon: Bot,
                title: "1. Create the bot",
                copy: "Use BotFather, copy the token, then start a private chat with your bot.",
              },
              {
                icon: KeyRound,
                title: "2. Secure the channel",
                copy: "SwiftFlow encrypts the token, chat ID, and per-workspace webhook secret.",
              },
              {
                icon: Workflow,
                title: "3. Add a Telegram node",
                copy: "Choose Notification or Approval gate from the automation canvas.",
              },
              {
                icon: CheckCircle2,
                title: "4. Approve safely",
                copy: "Each button is single-use, expires automatically, and resumes the pinned workflow version.",
              },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-2xl border border-white/8 bg-black/20 p-3.5"
                >
                  <div className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sky-300/12 bg-sky-300/[0.06] text-sky-200/75">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white/75">
                        {step.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-white/35">
                        {step.copy}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </aside>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Credential storage", value: "AES-GCM encrypted" },
          { label: "Approval delivery", value: "Signed webhook" },
          { label: "Failure behavior", value: "Fail closed" },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3"
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/28">
              {metric.label}
            </p>
            <p className="mt-1 text-sm font-medium text-white/68">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
