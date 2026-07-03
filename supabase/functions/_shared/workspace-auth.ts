import { isAuthorizedInternalInvoke } from "./internal-auth.ts";

/**
 * Authorization guard for user-facing Edge Functions that use a service-role
 * client with a caller-supplied workspaceId.
 *
 * Internal callers (service-role key via apikey/Authorization, i.e. the app
 * server which enforces auth + membership before invoking) are trusted.
 * Any other caller must present a Supabase user JWT and be a member of the
 * requested workspace — a bare anon/project JWT is not enough.
 *
 * Returns a Response (400/401/403/500) to send back, or null when authorized.
 */
export async function assertWorkspaceAccess(
  req: Request,
  supabaseAdmin,
  workspaceId: unknown,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  if (isAuthorizedInternalInvoke(req)) return null;

  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ success: false, error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const authorization = req.headers.get('authorization') || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return deny(401, 'Unauthorized');

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  const user = data?.user;
  if (error || !user) return deny(401, 'Unauthorized');

  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return deny(400, 'workspaceId is required');
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId.trim())
    .maybeSingle();

  if (membershipError) {
    console.error('[workspace-auth] membership check failed:', membershipError.message);
    return deny(500, 'Failed to validate workspace access');
  }
  if (!membership) return deny(403, 'No access to the selected workspace');

  return null;
}
