# SSRF False Positives Tracking

## SSRF-VULN-01: Automation Worker Unrestricted fetch() [DISABLED]
- **Verdict:** OUT_OF_SCOPE_INTERNAL / FALSE_POSITIVE (temporarily disabled)
- **What was attempted:** N/A - the vulnerability is disabled via `TEMP_DISABLED_ACTION_TYPES = new Set(['action_http_request'])` in `supabase/functions/process-automations/graph-executor.ts:33`. The action type check blocks execution before any request is made. Per exploitation queue, this was excluded from the queue (noted in analysis only).
- **Why it's a false positive for live testing:** The code path is unreachable in the current deployment. Testing would require a code change to re-enable the action type. This is not an externally exploitable vulnerability in the current state.
- **Note:** When re-enabled, this would be a Critical SSRF as the URL, method, headers, and body are all fully attacker-controlled with no sanitization.
