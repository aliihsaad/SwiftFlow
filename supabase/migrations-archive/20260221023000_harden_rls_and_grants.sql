-- Security hardening pass
-- 1) Remove broad anonymous table access.
-- 2) Enable RLS on tables that already have policies but had RLS disabled.
-- 3) Add missing workspace-scoped policies for analytics/external_services.
-- 4) Restrict oauth_page_sessions to service role only (contains sensitive tokens).

BEGIN;

-- Remove anonymous access across public tables/sequences.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Keep default privileges safe for newly created relations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Enable RLS where policies already exist but were not enforced.
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_brand_profiles ENABLE ROW LEVEL SECURITY;

-- New RLS: external_services (workspace-scoped CRUD for members).
ALTER TABLE public.external_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view external services in their workspaces" ON public.external_services;
CREATE POLICY "Users can view external services in their workspaces"
  ON public.external_services
  FOR SELECT
  USING (is_member_of(workspace_id));

DROP POLICY IF EXISTS "Users can create external services in their workspaces" ON public.external_services;
CREATE POLICY "Users can create external services in their workspaces"
  ON public.external_services
  FOR INSERT
  WITH CHECK (is_member_of(workspace_id));

DROP POLICY IF EXISTS "Users can update external services in their workspaces" ON public.external_services;
CREATE POLICY "Users can update external services in their workspaces"
  ON public.external_services
  FOR UPDATE
  USING (is_member_of(workspace_id))
  WITH CHECK (is_member_of(workspace_id));

DROP POLICY IF EXISTS "Users can delete external services in their workspaces" ON public.external_services;
CREATE POLICY "Users can delete external services in their workspaces"
  ON public.external_services
  FOR DELETE
  USING (is_member_of(workspace_id));

DROP POLICY IF EXISTS "Service role has full access to external_services" ON public.external_services;
CREATE POLICY "Service role has full access to external_services"
  ON public.external_services
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- New RLS: published_posts (read-only for workspace members).
ALTER TABLE public.published_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view published posts in their workspaces" ON public.published_posts;
CREATE POLICY "Users can view published posts in their workspaces"
  ON public.published_posts
  FOR SELECT
  USING (
    post_id IN (
      SELECT p.id
      FROM public.posts p
      WHERE is_member_of(p.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Service role has full access to published_posts" ON public.published_posts;
CREATE POLICY "Service role has full access to published_posts"
  ON public.published_posts
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- New RLS: post_analytics (read-only for workspace members via published_posts -> posts).
ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view post analytics in their workspaces" ON public.post_analytics;
CREATE POLICY "Users can view post analytics in their workspaces"
  ON public.post_analytics
  FOR SELECT
  USING (
    published_post_id IN (
      SELECT pp.id
      FROM public.published_posts pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE is_member_of(p.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Service role has full access to post_analytics" ON public.post_analytics;
CREATE POLICY "Service role has full access to post_analytics"
  ON public.post_analytics
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- New RLS: account_analytics (read-only for workspace members via social_accounts).
ALTER TABLE public.account_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view account analytics in their workspaces" ON public.account_analytics;
CREATE POLICY "Users can view account analytics in their workspaces"
  ON public.account_analytics
  FOR SELECT
  USING (
    social_account_id IN (
      SELECT sa.id
      FROM public.social_accounts sa
      WHERE is_member_of(sa.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Service role has full access to account_analytics" ON public.account_analytics;
CREATE POLICY "Service role has full access to account_analytics"
  ON public.account_analytics
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- New RLS: oauth_page_sessions (sensitive tokens, service role only).
ALTER TABLE public.oauth_page_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to oauth_page_sessions" ON public.oauth_page_sessions;
CREATE POLICY "Service role has full access to oauth_page_sessions"
  ON public.oauth_page_sessions
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Tighten authenticated grants on analytics/session tables.
REVOKE INSERT, UPDATE, DELETE ON public.account_analytics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.post_analytics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.published_posts FROM authenticated;
REVOKE ALL ON public.oauth_page_sessions FROM authenticated;

COMMIT;
