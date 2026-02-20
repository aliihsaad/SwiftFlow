// @ts-nocheck - Shared Deno runtime helpers

interface InvokeResult<T = any> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

function getEdgeHeaders(serviceRoleKey: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`,
    'apikey': serviceRoleKey,
  };
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
