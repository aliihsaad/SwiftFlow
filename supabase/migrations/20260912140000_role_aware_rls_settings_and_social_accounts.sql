-- Makes row level security enforce the workspace role model that until now
-- existed only in application code (lib/workspace-rbac.ts).
--
-- THE GAP
-- public.is_member_of(uuid) resolves membership and nothing else, so the
-- baseline "Member access settings" and "Member access social_accounts"
-- policies (both FOR ALL, no FOR clause) granted every member — including
-- `viewer` — full read AND write. Combined with the table-level
-- GRANT ALL ... TO authenticated that both tables carry, a viewer could skip
-- the application entirely, call PostgREST with their own JWT, and overwrite
-- provider credentials: telegram_bot_token, the AI provider keys, and the
-- Instagram access_token / refresh_token on social_accounts. Because
-- decryptSecretIfNeeded() passes through any value lacking an enc: prefix,
-- an attacker-written plaintext token is then used verbatim by the runtime.
--
-- WHY THIS DOES NOT CHANGE APPLICATION BEHAVIOUR
-- Every session-client write path to these two tables already enforces the
-- same restriction in application code, verified route by route:
--   workspace_settings -> requireWorkspacePermission(..., 'settings:write')
--     app/actions/settings.ts, app/actions/telegram-settings.ts,
--     app/api/workspace/settings/route.ts:185
--   social_accounts    -> requireWorkspacePermission(..., 'integrations:write')
--     app/actions/settings.ts, app/api/auth/instagram/{callback,refresh,
--     subscribe,verify}/route.ts, app/api/brand/social-accounts/route.ts:32
-- Both permissions map to ["owner","admin"] in WORKSPACE_PERMISSION_ROLE_MAP,
-- so these policies mirror the checks the app already makes. Reads are
-- unchanged and remain open to every member ('workspace:read' includes
-- viewer). Service-role callers (edge functions, admin client) bypass RLS
-- entirely and are unaffected.
--
-- SCOPE
-- Deliberately limited to the two tables that hold credentials. The same
-- role-blind FOR ALL pattern exists on other baseline tables and is tracked
-- separately; doing those needs the same per-table review of write paths and
-- is not safe to do blind.

-- 1. Role-aware membership helper --------------------------------------------
--
-- Mirrors is_member_of but constrains the member's role. SECURITY DEFINER for
-- the same reason is_member_of is: it must read workspace_members while that
-- table's own RLS is in force. search_path is pinned, with pg_temp last.
--
-- Like is_member_of, this has to stay executable by `authenticated` because
-- RLS policies calling it are evaluated as the querying role. That is the same
-- documented trade-off recorded in
-- 20260702110000_advisor_security_and_fk_index_remediation.sql.

create or replace function public.has_workspace_role(_workspace_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = auth.uid()
      and role = any(_roles)
  );
$$;

revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- 2. workspace_settings -------------------------------------------------------
--
-- The worker-role policies on these tables are intentionally left in place;
-- only the role-blind member policy is replaced.

drop policy if exists "Member access settings" on public.workspace_settings;

create policy "workspace_settings_member_select"
  on public.workspace_settings
  for select
  using (public.is_member_of(workspace_id));

create policy "workspace_settings_admin_insert"
  on public.workspace_settings
  for insert
  to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workspace_settings_admin_update"
  on public.workspace_settings
  for update
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workspace_settings_admin_delete"
  on public.workspace_settings
  for delete
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- 3. social_accounts ----------------------------------------------------------

drop policy if exists "Member access social_accounts" on public.social_accounts;

create policy "social_accounts_member_select"
  on public.social_accounts
  for select
  using (public.is_member_of(workspace_id));

create policy "social_accounts_admin_insert"
  on public.social_accounts
  for insert
  to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "social_accounts_admin_update"
  on public.social_accounts
  for update
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "social_accounts_admin_delete"
  on public.social_accounts
  for delete
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));
