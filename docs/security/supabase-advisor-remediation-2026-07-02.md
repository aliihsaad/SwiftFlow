# Supabase Advisor Remediation — 2026-07-02 (Task 2)

Baseline advisor run (`supabase db advisors --linked --type all`) returned **307 findings**:

| Level | Count | Advisor |
| --- | --- | --- |
| WARN | 180 | multiple_permissive_policies |
| WARN | 70 | auth_rls_initplan |
| INFO | 20 | unindexed_foreign_keys |
| INFO | 20 | unused_index |
| WARN | 6 | function_search_path_mutable |
| WARN | 3 | anon_security_definer_function_executable |
| WARN | 3 | authenticated_security_definer_function_executable |
| WARN | 2 | public_bucket_allows_listing |
| WARN | 1 | extension_in_public (pg_net) |
| WARN | 1 | auth_leaked_password_protection |
| WARN | 1 | duplicate_index |

## Fixed in migration `20260702110000_advisor_security_and_fk_index_remediation.sql`

- **function_search_path_mutable (6/6):** pinned `search_path` on `update_conversation_updated_at`,
  `update_updated_at_column`, `update_workspace_settings_timestamp` (empty), and
  `is_member_of`, `create_default_settings`, `create_default_workspace_settings` (`public, pg_temp`).
- **anon/authenticated_security_definer_function_executable (4/6):** revoked REST execute on the two
  trigger-only definer functions `create_default_settings` and `create_default_workspace_settings`
  from `anon`, `authenticated`, `public`. They fire as triggers owned by `postgres`; no role needs RPC execute.
- **unindexed_foreign_keys (20/20):** added covering indexes for every flagged FK.
- **duplicate_index (1/1):** dropped `account_analytics_social_account_id_date_key` (identical to
  `account_analytics_social_account_date_unique`).

## Deliberately deferred (with rationale)

- **is_member_of anon/authenticated executable (2 findings):** `is_member_of(uuid)` backs 10+ RLS
  policies (`posts`, `workspace_settings`, `social_accounts`, `external_services`, `workspace_members`,
  `workspaces`, `analytics_snapshots`, …). RLS `USING` expressions are evaluated as the querying role,
  so revoking `EXECUTE` from `authenticated` would break row-level security across the app. It must stay
  executable. `search_path` is now pinned, which is the safe part of the fix.
- **multiple_permissive_policies (180) + auth_rls_initplan (70):** consolidating ~250 policies and
  rewriting `auth.uid()` → `(select auth.uid())` is high-value for performance but must be done
  per-policy with tenant-isolation review — a blind mass rewrite risks opening cross-workspace access.
  Tracked as a dedicated follow-up slice, not bundled into this security handoff.
- **public_bucket_allows_listing (`generated_assets`, `post_media`):** these are intentionally public
  buckets serving media by public URL. Removing the broad SELECT policy could break public media
  rendering. Needs a product/ops decision on signed URLs vs. public listing before changing.
- **extension_in_public (pg_net):** moving `pg_net` out of `public` can break existing
  `net.http_*` call sites and scheduled jobs; requires coordinated search_path/config change. Documented
  for a maintenance window.
- **auth_leaked_password_protection:** enable HaveIBeenPwned check in Supabase Auth dashboard
  (Auth → Policies). Dashboard toggle, not a migration.
- **unused_index (20):** informational; several back recently added features and may simply be unused in
  the current low-traffic window. Not dropped without usage confirmation on production traffic.

## Verification status — COMPLETE

All three migrations (`20260701210000` publishing claim locking, `20260702100000` scheduled-execution
claim locking, `20260702110000` advisor remediation) are applied and in sync with the linked project.
All 17 changed Edge Functions were redeployed with the correct `--no-verify-jwt` split.
`supabase db lint --schema public` → **No schema errors found.**

Advisor totals before → after remediation (`supabase db advisors --type all`): **307 → 296.**

| Advisor | Before | After | Note |
| --- | --- | --- | --- |
| function_search_path_mutable | 6 | 0 | fixed |
| unindexed_foreign_keys | 20 | 0 | fixed |
| duplicate_index | 1 | 0 | fixed |
| anon_security_definer_function_executable | 3 | 1 | 2 fixed; `is_member_of` intentionally kept (RLS) |
| authenticated_security_definer_function_executable | 3 | 1 | 2 fixed; `is_member_of` intentionally kept (RLS) |
| unused_index | 20 | 40 | +20 = the new FK indexes; read as "unused" until traffic/cascade deletes exercise them (expected, not a regression) |
| multiple_permissive_policies | 180 | 180 | deferred (see above) |
| auth_rls_initplan | 70 | 70 | deferred (see above) |
| public_bucket_allows_listing | 2 | 2 | deferred (see above) |
| extension_in_public (pg_net) | 1 | 1 | deferred (see above) |
| auth_leaked_password_protection | 1 | 1 | dashboard toggle |

Every security warning targeted by this handoff is resolved; the remainder are the documented deferrals
plus the expected new-FK-index bookkeeping.
