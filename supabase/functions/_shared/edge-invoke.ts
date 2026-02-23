// @ts-nocheck - Shared Deno runtime helpers

interface InvokeResult<T = any> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

function looksLikeJwt(value: string | undefined | null): boolean {
  const v = String(value || '').trim();
  return v.startsWith('eyJ') && v.split('.').length === 3;
}

function getEdgeHeaders(serviceRoleKey: string) {
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ||
    Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    '';

  // Edge Functions with verify_jwt enabled require a JWT in Authorization.
  // New Supabase secret keys (sb_secret_...) are not JWTs, so use the anon JWT
  // for gateway auth and keep the service role key for DB admin access inside functions.
  const authJwt = looksLikeJwt(serviceRoleKey)
    ? serviceRoleKey
    : (looksLikeJwt(anonKey) ? anonKey : '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Prefer service role for internal invocations; functions use service-role DB access internally.
    'apikey': serviceRoleKey || anonKey,
  };

  // Only send Authorization when we actually have a JWT; new sb_secret_/sb_publishable_
  // keys are not JWTs and cause "Invalid JWT" at the function gateway.
  if (authJwt) {
    headers['Authorization'] = `Bearer ${authJwt}`;
  }

  return headers;
}

export async function invokeEdgeFunction<T = any>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, status: 500, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing' };
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getEdgeHeaders(serviceRoleKey),
      body: JSON.stringify(payload || {}),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || `Function ${functionName} failed with ${response.status}`;
      return { ok: false, status: response.status, error: String(errorMessage), data };
    }

    return { ok: true, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 500, error: err?.message || 'Edge invocation failed' };
  }
}
