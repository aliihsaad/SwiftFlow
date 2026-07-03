// @ts-nocheck - Shared Deno runtime helpers

/**
 * Internal invocation guard for Edge Functions that are deployed with
 * --no-verify-jwt (or otherwise reachable) but must only be called by
 * internal dispatchers (app server admin client, scheduler-tick, or other
 * edge functions via invokeEdgeFunction).
 *
 * The caller must present a service role credential either as the `apikey`
 * header (what invokeEdgeFunction and supabase-js admin clients send) or
 * as an `Authorization: Bearer` token.
 *
 * Matching is NOT plain string equality against the runtime-injected
 * SUPABASE_SERVICE_ROLE_KEY: after Supabase's API-key migration the app
 * server can legitimately hold a different-but-valid service credential
 * (legacy service_role JWT vs new sb_secret key) than the one injected into
 * this runtime. Equality is kept as the fast path; otherwise the presented
 * credential is validated against the Auth admin API (service-role only)
 * and the verdict is cached for the lifetime of this isolate.
 */

const serviceKeyVerdicts = new Map<string, boolean>();

async function isValidServiceCredential(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  if (serviceKeyVerdicts.has(candidate)) return serviceKeyVerdicts.get(candidate)!;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  if (!supabaseUrl) return false;

  let valid = false;
  try {
    // GoTrue admin endpoints only answer 2xx to service-role credentials.
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: candidate, Authorization: `Bearer ${candidate}` },
    });
    valid = response.ok;
    // Drain the body so the connection can be reused.
    await response.body?.cancel();
  } catch {
    // Network failure: treat as unauthorized; do not cache the verdict.
    return false;
  }

  serviceKeyVerdicts.set(candidate, valid);
  return valid;
}

export async function isAuthorizedInternalInvoke(req: Request): Promise<boolean> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceRoleKey) {
    console.error('[internal-auth] Missing SUPABASE_SERVICE_ROLE_KEY for internal auth check');
    return false;
  }

  const apiKey = req.headers.get('apikey') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // Fast path: byte-identical to the runtime-injected service key.
  if (apiKey === serviceRoleKey || bearer === serviceRoleKey) return true;

  // Fallback: any credential Supabase Auth recognizes as service-role.
  for (const candidate of new Set([apiKey, bearer])) {
    if (await isValidServiceCredential(candidate)) return true;
  }
  return false;
}

/**
 * Returns a 401 Response when the request is not an authorized internal
 * invocation, or null when the caller may proceed.
 *
 * Usage:
 *   const unauthorized = await assertInternalInvoke(req, corsHeaders);
 *   if (unauthorized) return unauthorized;
 */
export async function assertInternalInvoke(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  if (await isAuthorizedInternalInvoke(req)) return null;

  return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
