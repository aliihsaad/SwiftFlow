// @ts-nocheck - Shared Deno runtime helpers

/**
 * Internal invocation guard for Edge Functions that are deployed with
 * --no-verify-jwt (or otherwise reachable) but must only be called by
 * internal dispatchers (app server admin client, scheduler-tick, or other
 * edge functions via invokeEdgeFunction).
 *
 * The caller must present the service role key either as the `apikey`
 * header (what invokeEdgeFunction and supabase-js admin clients send) or
 * as an `Authorization: Bearer` token. Mirrors the checks already used by
 * process-publishing-automations and automation-worker-send-email.
 */
export function isAuthorizedInternalInvoke(req: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceRoleKey) {
    console.error('[internal-auth] Missing SUPABASE_SERVICE_ROLE_KEY for internal auth check');
    return false;
  }

  const apiKey = req.headers.get('apikey') || '';
  const authorization = req.headers.get('authorization') || '';
  return apiKey === serviceRoleKey || authorization === `Bearer ${serviceRoleKey}`;
}

/**
 * Returns a 401 Response when the request is not an authorized internal
 * invocation, or null when the caller may proceed.
 *
 * Usage:
 *   const unauthorized = assertInternalInvoke(req, corsHeaders);
 *   if (unauthorized) return unauthorized;
 */
export function assertInternalInvoke(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Response | null {
  if (isAuthorizedInternalInvoke(req)) return null;

  return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
