// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAutomationTelegramMessage,
  callTelegramBotApi,
  loadTelegramWorkspaceConnection,
} from "../_shared/automation-telegram.ts";
import { assertInternalInvoke } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const unauthorized = await assertInternalInvoke(req, corsHeaders);
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const workspaceId = String(body?.workspace_id || "").trim();
    const config = body?.config || {};
    const context = body?.context || {};
    const mode = config?.mode === "approval" ? "approval" : "notification";

    if (!workspaceId)
      return json({ success: false, error: "Telegram workspace is missing" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const connection = await loadTelegramWorkspaceConnection(
      supabase,
      workspaceId,
    );
    const message = buildAutomationTelegramMessage({
      config,
      context,
      automation: {
        id: body?.automation_id || null,
        name: body?.automation_name || null,
        workspace_id: workspaceId,
      },
      node: {
        id: body?.node_id || null,
        data: {
          type: body?.node_type || null,
          label: body?.node_label || null,
        },
      },
      approval: mode === "approval",
    });

    if (!message)
      return json({ success: false, error: "Telegram message is empty" });

    if (mode === "notification") {
      const sent = await callTelegramBotApi(
        connection.botToken,
        "sendMessage",
        {
          chat_id: connection.chatId,
          text: message,
          disable_web_page_preview: true,
        },
      );
      return json({
        success: true,
        output: {
          provider: "telegram",
          mode,
          message_id: sent?.message_id || null,
        },
      });
    }

    const approval = body?.approval || {};
    const requestId = String(approval?.request_id || "").trim();
    const runId = String(approval?.run_id || "").trim() || null;
    const workflowVersionId = String(
      approval?.workflow_version_id || "",
    ).trim();
    const expiresAt = String(approval?.expires_at || "").trim();
    const approvedNextNodes = Array.isArray(approval?.approved_next_nodes)
      ? approval.approved_next_nodes
      : [];
    const rejectedNextNodes = Array.isArray(approval?.rejected_next_nodes)
      ? approval.rejected_next_nodes
      : [];

    if (!requestId || !workflowVersionId || !expiresAt) {
      return json({
        success: false,
        error: "Telegram approval metadata is incomplete",
      });
    }

    const row = {
      id: requestId,
      workspace_id: workspaceId,
      automation_id: body?.automation_id,
      workflow_version_id: workflowVersionId,
      run_id: runId,
      node_id: body?.node_id,
      status: "pending",
      execution_context: approval?.execution_context || {},
      approved_next_nodes: approvedNextNodes,
      rejected_next_nodes: rejectedNextNodes,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("automation_approval_requests")
      .insert(row);
    if (insertError && insertError.code !== "23505") {
      return json({
        success: false,
        error: "Telegram approval could not be persisted",
      });
    }

    if (insertError?.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("automation_approval_requests")
        .select("status, telegram_message_id, expires_at")
        .eq("id", requestId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (existingError || !existing) {
        return json({
          success: false,
          error: "Telegram approval could not be recovered",
        });
      }
      if (existing.status !== "pending") {
        return json({
          success: false,
          error: "Telegram approval is already resolved",
        });
      }
      if (existing.telegram_message_id) {
        return json({
          success: true,
          output: {
            provider: "telegram",
            mode,
            awaiting_approval: true,
            approval_request_id: requestId,
            message_id: existing.telegram_message_id,
            expires_at: existing.expires_at,
          },
        });
      }
    }

    try {
      const sent = await callTelegramBotApi(
        connection.botToken,
        "sendMessage",
        {
          chat_id: connection.chatId,
          text: message,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Approve", callback_data: `sf:a:${requestId}` },
                { text: "Reject", callback_data: `sf:r:${requestId}` },
              ],
            ],
          },
        },
      );

      const { error: updateError } = await supabase
        .from("automation_approval_requests")
        .update({
          telegram_message_id: sent?.message_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");

      if (updateError) {
        throw new Error("Telegram approval delivery could not be recorded");
      }

      return json({
        success: true,
        output: {
          provider: "telegram",
          mode,
          awaiting_approval: true,
          approval_request_id: requestId,
          message_id: sent?.message_id || null,
          expires_at: expiresAt,
        },
      });
    } catch (error) {
      await supabase
        .from("automation_approval_requests")
        .update({
          status: "failed",
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");

      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Telegram worker failed";
    return json({ success: false, error: message }, 500);
  }
});
