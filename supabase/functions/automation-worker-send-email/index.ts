// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { interpolateTemplate } from "../_shared/automation-context.ts"
import { sendResendEmail, textToSimpleHtml } from "../_shared/resend-email.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isAuthorizedInternalInvoke(req: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceRoleKey) return false;

  const apiKey = req.headers.get('apikey') || '';
  const authorization = req.headers.get('authorization') || '';
  return apiKey === serviceRoleKey || authorization === `Bearer ${serviceRoleKey}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedInternalInvoke(req)) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const config = body?.config || {};
    const context = body?.context || {};
    const automationId = body?.automation_id || null;
    const workspaceId = body?.workspace_id || null;
    const nodeId = body?.node_id || null;

    const recipientType = String(config?.recipient_type || 'custom');
    if (recipientType !== 'custom') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Send Email node supports custom recipients only',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = String(config?.recipient_email || '').trim();
    if (!to) {
      return new Response(JSON.stringify({ success: false, error: 'Email address is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = interpolateTemplate(String(config?.subject || ''), context).trim();
    const messageBody = interpolateTemplate(String(config?.body || ''), context).trim();

    if (!subject) {
      return new Response(JSON.stringify({ success: false, error: 'Email subject is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messageBody) {
      return new Response(JSON.stringify({ success: false, error: 'Email body is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const footerLines = [
      '',
      '---',
      'Sent by SwiftFlow Automation',
      workspaceId ? `Workspace: ${workspaceId}` : null,
      automationId ? `Automation: ${automationId}` : null,
      nodeId ? `Node: ${nodeId}` : null,
    ].filter(Boolean).join('\n');

    const text = `${messageBody}${footerLines}`;

    const sendResult = await sendResendEmail({
      to,
      subject,
      text,
      html: textToSimpleHtml(text),
    });

    return new Response(JSON.stringify({
      success: true,
      output: {
        to,
        subject,
        provider: 'resend',
        email_id: sendResult.id || null,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
