-- Finishes the function hardening started in
-- 20260702110000_advisor_security_and_fk_index_remediation.sql, which pinned
-- search_path on six functions and revoked REST execute on two trigger-only
-- SECURITY DEFINER functions. Live Supabase advisors still report:
--
--   anon_security_definer_function_executable          (5 functions)
--   authenticated_security_definer_function_executable (5 functions)
--   function_search_path_mutable                       (2 functions)
--
-- because four more trigger-only SECURITY DEFINER functions were added after
-- that migration and never had their REST execute revoked, and two claim
-- functions were added without a pinned search_path.

-- 1. Revoke REST execute on trigger-only SECURITY DEFINER functions -----------
--
-- All four fire only from triggers owned by postgres (one CREATE TRIGGER each,
-- zero application rpc() call sites). Nothing needs to reach them over
-- PostgREST, and as SECURITY DEFINER they should not be callable by anon or
-- authenticated. Same treatment 20260702110000 gave create_default_settings
-- and create_default_workspace_settings.
--
-- is_member_of(uuid) is deliberately NOT revoked here: it backs 16 RLS policy
-- expressions in the baseline schema, and revoking execute would break
-- row-level security. That exception is documented in 20260702110000.

revoke all on function public.capture_automation_workflow_version() from anon, authenticated, public;
revoke all on function public.pin_automation_execution_workflow_version() from anon, authenticated, public;
revoke all on function public.reject_automation_execution_event_mutation() from anon, authenticated, public;
revoke all on function public.reject_workflow_version_mutation() from anon, authenticated, public;

-- 2. Pin search_path on the two claim functions ------------------------------
--
-- Both are SECURITY INVOKER, so there is no privilege-escalation path and this
-- is hygiene rather than a fix: it silences function_search_path_mutable and
-- makes resolution deterministic. Their bodies already schema-qualify every
-- object reference, and execute is granted only to service_role and the
-- least-privilege worker roles, so behaviour is unchanged.

alter function public.claim_webhook_inbox_events(text, integer, integer) set search_path = public, pg_temp;
alter function public.claim_automation_actions(text, integer, integer) set search_path = public, pg_temp;
