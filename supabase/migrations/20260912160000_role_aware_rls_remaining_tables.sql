-- Extends the role-aware RLS model from
-- 20260912140000_role_aware_rls_settings_and_social_accounts.sql to the
-- remaining baseline tables whose policies resolve membership but not role.
--
-- Each table's write roles are taken from the permission its own routes
-- already enforce via requireWorkspacePermission, per
-- WORKSPACE_PERMISSION_ROLE_MAP in lib/workspace-rbac.ts:
--
--   content:write    -> owner, admin, editor
--   automation:write -> owner, admin
--   settings:write   -> owner, admin
--   analytics:sync   -> owner, admin
--
-- | table                           | permission       | enforced by                              |
-- |---------------------------------|------------------|------------------------------------------|
-- | posts                           | content:write    | (service-role writes only today)         |
-- | comments                        | content:write    | app/api/posts-media/comments/route.ts    |
-- | conversations, messages         | content:write    | app/api/messages/route.ts                |
-- | automations                     | automation:write | app/api/automations/*                    |
-- | automation_logs                 | automation:write | (service-role writes only today)         |
-- | automation_scheduled_executions | automation:write | (service-role writes only today)         |
-- | processed_comments              | automation:write | app/api/automations/route.ts             |
-- | external_services               | settings:write   | app/api/external-services/*              |
-- | workspace_brand_profiles        | settings:write   | app/api/brand-profile/route.ts           |
-- | analytics_snapshots             | analytics:sync   | app/api/sync-analytics/route.ts          |
--
-- Reads are unchanged everywhere: every member, viewer included, keeps SELECT.
-- Service-role callers bypass RLS entirely, and the existing
-- "Service role has full access" policies are left alone — they are scoped by
-- an auth.jwt() role check in their USING clause, not by role grant, so they
-- never widen access for a normal user.
--
-- Worker-role policies (swiftflow_action_executor, swiftflow_webhook_comparison)
-- are likewise untouched.
--
-- Tables deliberately NOT changed here:
--   workspaces, workspace_members, workspace_invites, publishing_automations
--     - already role-constrained (owner/admin) in their existing policies.
--   chat_sessions
--     - scoped per user (auth.uid() = user_id), not by workspace role.

-- ---------------------------------------------------------------------------
-- posts : content:write
-- ---------------------------------------------------------------------------
drop policy if exists "Member access posts" on public.posts;

create policy "posts_member_select" on public.posts
  for select using (public.is_member_of(workspace_id));
create policy "posts_editor_insert" on public.posts
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "posts_editor_update" on public.posts
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "posts_editor_delete" on public.posts
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

-- ---------------------------------------------------------------------------
-- analytics_snapshots : analytics:sync
-- ---------------------------------------------------------------------------
drop policy if exists "Member access analytics" on public.analytics_snapshots;

create policy "analytics_snapshots_member_select" on public.analytics_snapshots
  for select using (public.is_member_of(workspace_id));
create policy "analytics_snapshots_admin_insert" on public.analytics_snapshots
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "analytics_snapshots_admin_update" on public.analytics_snapshots
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "analytics_snapshots_admin_delete" on public.analytics_snapshots
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- automations : automation:write
-- The blanket ALL policy is dropped; the existing member SELECT policy and the
-- two worker SELECT policies are kept.
-- ---------------------------------------------------------------------------
drop policy if exists "workspace_automations_policy" on public.automations;
drop policy if exists "Users can create automations in their workspaces" on public.automations;
drop policy if exists "Users can update automations in their workspaces" on public.automations;
drop policy if exists "Users can delete automations in their workspaces" on public.automations;

create policy "automations_admin_insert" on public.automations
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "automations_admin_update" on public.automations
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "automations_admin_delete" on public.automations
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- automation_logs : automation:write (scoped through the parent automation)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create automation logs" on public.automation_logs;
drop policy if exists "Users can update automation logs" on public.automation_logs;

create policy "automation_logs_admin_insert" on public.automation_logs
  for insert to authenticated
  with check (exists (
    select 1 from public.automations a
    where a.id = automation_logs.automation_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin'])
  ));
create policy "automation_logs_admin_update" on public.automation_logs
  for update to authenticated
  using (exists (
    select 1 from public.automations a
    where a.id = automation_logs.automation_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin'])
  ));

-- ---------------------------------------------------------------------------
-- automation_scheduled_executions : automation:write
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create scheduled executions in their workspaces" on public.automation_scheduled_executions;
drop policy if exists "Users can update scheduled executions in their workspaces" on public.automation_scheduled_executions;
drop policy if exists "Users can delete scheduled executions in their workspaces" on public.automation_scheduled_executions;

-- This table carries no workspace_id; it is scoped through its parent
-- automation, the same way automation_logs is.
create policy "automation_scheduled_executions_admin_insert" on public.automation_scheduled_executions
  for insert to authenticated
  with check (exists (
    select 1 from public.automations a
    where a.id = automation_scheduled_executions.automation_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin'])
  ));
create policy "automation_scheduled_executions_admin_update" on public.automation_scheduled_executions
  for update to authenticated
  using (exists (
    select 1 from public.automations a
    where a.id = automation_scheduled_executions.automation_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin'])
  ));
create policy "automation_scheduled_executions_admin_delete" on public.automation_scheduled_executions
  for delete to authenticated
  using (exists (
    select 1 from public.automations a
    where a.id = automation_scheduled_executions.automation_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin'])
  ));

-- ---------------------------------------------------------------------------
-- processed_comments : automation:write (INSERT only; no user UPDATE/DELETE existed)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create processed comments in their workspaces" on public.processed_comments;

create policy "processed_comments_admin_insert" on public.processed_comments
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- comments : content:write
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert comments in their workspace" on public.comments;
drop policy if exists "Users can update comments in their workspace" on public.comments;
drop policy if exists "Users can delete comments in their workspace" on public.comments;

create policy "comments_editor_insert" on public.comments
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "comments_editor_update" on public.comments
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "comments_editor_delete" on public.comments
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

-- ---------------------------------------------------------------------------
-- conversations : content:write
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert conversations in their workspace" on public.conversations;
drop policy if exists "Users can update conversations in their workspace" on public.conversations;
drop policy if exists "Users can delete conversations in their workspace" on public.conversations;

create policy "conversations_editor_insert" on public.conversations
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "conversations_editor_update" on public.conversations
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "conversations_editor_delete" on public.conversations
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

-- ---------------------------------------------------------------------------
-- messages : content:write
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert messages in their workspace" on public.messages;
drop policy if exists "Users can update messages in their workspace" on public.messages;
drop policy if exists "Users can delete messages in their workspace" on public.messages;

create policy "messages_editor_insert" on public.messages
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "messages_editor_update" on public.messages
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
create policy "messages_editor_delete" on public.messages
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

-- ---------------------------------------------------------------------------
-- external_services : settings:write
-- This table stores encrypted third-party credentials (api_key, password), so
-- the reveal endpoint already requires settings:write. Writes now match.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create external services in their workspaces" on public.external_services;
drop policy if exists "Users can update external services in their workspaces" on public.external_services;
drop policy if exists "Users can delete external services in their workspaces" on public.external_services;

create policy "external_services_admin_insert" on public.external_services
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "external_services_admin_update" on public.external_services
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "external_services_admin_delete" on public.external_services
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- workspace_brand_profiles : settings:write (no user DELETE policy existed)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create brand profiles for their workspaces" on public.workspace_brand_profiles;
drop policy if exists "Users can update brand profiles of their workspaces" on public.workspace_brand_profiles;

create policy "workspace_brand_profiles_admin_insert" on public.workspace_brand_profiles
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
create policy "workspace_brand_profiles_admin_update" on public.workspace_brand_profiles
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
