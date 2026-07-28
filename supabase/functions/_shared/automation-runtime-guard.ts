export type AutomationRuntimeResource = 'provider_send' | 'ai_generation';

export interface AutomationRuntimeGuardScope {
  workspaceId: string;
  socialAccountId: string;
  automationId: string;
  resourceKind: AutomationRuntimeResource;
}

export interface AutomationRuntimeGuardPolicy {
  accountLimit: number;
  automationLimit: number;
  windowSeconds: number;
  failureThreshold: number;
  cooldownSeconds: number;
}

export interface AutomationRuntimeGuardDecision {
  allowed: boolean;
  reason: string;
  retryAfterSeconds: number;
  accountRemaining: number;
  automationRemaining: number;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function resolveAutomationRuntimeGuardPolicy(
  resourceKind: AutomationRuntimeResource,
): AutomationRuntimeGuardPolicy {
  const prefix = resourceKind === 'provider_send'
    ? 'AUTOMATION_PROVIDER_SEND'
    : 'AUTOMATION_AI';
  const defaults = resourceKind === 'provider_send'
    ? { account: 60, automation: 20 }
    : { account: 120, automation: 60 };

  return {
    accountLimit: boundedInteger(
      Deno.env.get(`${prefix}_ACCOUNT_BUDGET`),
      defaults.account,
      1,
      100_000,
    ),
    automationLimit: boundedInteger(
      Deno.env.get(`${prefix}_AUTOMATION_BUDGET`),
      defaults.automation,
      1,
      100_000,
    ),
    windowSeconds: boundedInteger(
      Deno.env.get(`${prefix}_BUDGET_WINDOW_SECONDS`),
      3600,
      1,
      86400,
    ),
    failureThreshold: boundedInteger(
      Deno.env.get(`${prefix}_CIRCUIT_FAILURE_THRESHOLD`),
      5,
      1,
      100,
    ),
    cooldownSeconds: boundedInteger(
      Deno.env.get(`${prefix}_CIRCUIT_COOLDOWN_SECONDS`),
      300,
      1,
      86400,
    ),
  };
}

export async function reserveAutomationRuntimeBudget(
  supabase: any,
  scope: AutomationRuntimeGuardScope,
  policy: AutomationRuntimeGuardPolicy,
): Promise<AutomationRuntimeGuardDecision> {
  const { data, error } = await supabase.rpc('reserve_automation_runtime_budget', {
    p_workspace_id: scope.workspaceId,
    p_social_account_id: scope.socialAccountId,
    p_automation_id: scope.automationId,
    p_resource_kind: scope.resourceKind,
    p_account_limit: policy.accountLimit,
    p_automation_limit: policy.automationLimit,
    p_window_seconds: policy.windowSeconds,
    p_cooldown_seconds: policy.cooldownSeconds,
  });

  if (error) {
    console.error('[AUTOMATION_GUARD] Reservation failed closed', {
      resourceKind: scope.resourceKind,
      code: String(error.code || 'rpc_error').slice(0, 80),
    });
    return {
      allowed: false,
      reason: 'runtime_guard_unavailable',
      retryAfterSeconds: 30,
      accountRemaining: 0,
      automationRemaining: 0,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      allowed: false,
      reason: 'runtime_guard_unavailable',
      retryAfterSeconds: 30,
      accountRemaining: 0,
      automationRemaining: 0,
    };
  }

  return {
    allowed: row.allowed === true,
    reason: String(row.reason || (row.allowed === true ? 'allowed' : 'runtime_guard_denied')),
    retryAfterSeconds: Math.max(Number(row.retry_after_seconds) || 0, 0),
    accountRemaining: Math.max(Number(row.account_remaining) || 0, 0),
    automationRemaining: Math.max(Number(row.automation_remaining) || 0, 0),
  };
}

export async function recordAutomationRuntimeOutcome(
  supabase: any,
  scope: AutomationRuntimeGuardScope,
  policy: AutomationRuntimeGuardPolicy,
  outcome: { succeeded: boolean; failureCode?: string },
): Promise<void> {
  const { error } = await supabase.rpc('record_automation_runtime_outcome', {
    p_workspace_id: scope.workspaceId,
    p_social_account_id: scope.socialAccountId,
    p_automation_id: scope.automationId,
    p_resource_kind: scope.resourceKind,
    p_succeeded: outcome.succeeded === true,
    p_failure_code: String(outcome.failureCode || 'provider_error')
      .replace(/\s+/g, '_')
      .slice(0, 120),
    p_failure_threshold: policy.failureThreshold,
    p_cooldown_seconds: policy.cooldownSeconds,
  });

  if (error) {
    console.error('[AUTOMATION_GUARD] Outcome recording failed', {
      resourceKind: scope.resourceKind,
      code: String(error.code || 'rpc_error').slice(0, 80),
    });
  }
}
