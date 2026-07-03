-- Supabase advisor remediation: security warnings + missing FK indexes.
--
-- Scope of this migration (safe, mechanical fixes):
--   1. Pin search_path on 6 functions flagged function_search_path_mutable.
--   2. Revoke REST execute on the two trigger-only SECURITY DEFINER functions
--      (they fire as triggers owned by postgres; no role needs RPC execute).
--   3. Add covering indexes for 20 unindexed foreign keys.
--   4. Drop one of two identical UNIQUE constraints on account_analytics.
--
-- Deliberately NOT changed here (documented in
-- docs/security/supabase-advisor-remediation-2026-07-02.md):
--   - is_member_of stays executable by authenticated: it backs 10+ RLS
--     policies, so revoking execute would break row-level security.
--   - multiple_permissive_policies / auth_rls_initplan: a 250-policy rewrite
--     needs per-policy review to preserve tenant isolation; tracked separately.
--   - public bucket listing, pg_net in public, leaked-password protection:
--     require product/ops decisions, tracked separately.

-- 1 + 2. Function hardening ---------------------------------------------------

-- Pure timestamp triggers (SECURITY INVOKER): empty search_path is safest.
alter function public.update_conversation_updated_at() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';
alter function public.update_workspace_settings_timestamp() set search_path = '';

-- Membership helper used inside RLS policies. Pin search_path but keep it
-- executable by authenticated so policies calling it continue to work.
alter function public.is_member_of(uuid) set search_path = public, pg_temp;

-- Trigger-only SECURITY DEFINER functions: pin search_path AND drop REST execute.
alter function public.create_default_settings() set search_path = public, pg_temp;
alter function public.create_default_workspace_settings() set search_path = public, pg_temp;

revoke all on function public.create_default_settings() from anon, authenticated, public;
revoke all on function public.create_default_workspace_settings() from anon, authenticated, public;

-- 3. Covering indexes for unindexed foreign keys -----------------------------

create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_workspace_id on public.chat_sessions(workspace_id);
create index if not exists idx_external_services_workspace_id on public.external_services(workspace_id);
create index if not exists idx_generated_assets_used_in_post_id on public.generated_assets(used_in_post_id);
create index if not exists idx_generated_assets_workspace_id on public.generated_assets(workspace_id);
create index if not exists idx_oauth_page_sessions_workspace_id on public.oauth_page_sessions(workspace_id);
create index if not exists idx_posts_source_publishing_automation_run_id on public.posts(source_publishing_automation_run_id);
create index if not exists idx_posts_workspace_id on public.posts(workspace_id);
create index if not exists idx_published_posts_post_id on public.published_posts(post_id);
create index if not exists idx_publishing_automation_runs_generated_post_id on public.publishing_automation_runs(generated_post_id);
create index if not exists idx_publishing_automations_created_by on public.publishing_automations(created_by);
create index if not exists idx_webhook_events_workspace_id on public.webhook_events(workspace_id);
create index if not exists idx_workspace_api_key_audit_logs_actor_user_id on public.workspace_api_key_audit_logs(actor_user_id);
create index if not exists idx_workspace_api_key_audit_logs_api_key_id on public.workspace_api_key_audit_logs(api_key_id);
create index if not exists idx_workspace_api_keys_created_by_user_id on public.workspace_api_keys(created_by_user_id);
create index if not exists idx_workspace_api_keys_revoked_by_user_id on public.workspace_api_keys(revoked_by_user_id);
create index if not exists idx_workspace_invites_accepted_by on public.workspace_invites(accepted_by);
create index if not exists idx_workspace_invites_invited_by on public.workspace_invites(invited_by);
create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);
create index if not exists idx_workspaces_owner_id on public.workspaces(owner_id);

-- 4. Drop duplicate UNIQUE constraint on account_analytics -------------------
-- Two identical UNIQUE(social_account_id, date) constraints exist; keep one.
alter table public.account_analytics
    drop constraint if exists account_analytics_social_account_id_date_key;
