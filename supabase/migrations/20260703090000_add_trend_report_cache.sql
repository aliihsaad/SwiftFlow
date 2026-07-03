-- Cached deep trend report results (~12h TTL enforced at read time).
-- Serves repeat requests without re-running live research and doubles as
-- report history for a future UI. Members read; only service role writes.

create table if not exists public.workspace_trend_report_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic text not null,
  platform text not null,
  depth text not null,
  report jsonb not null,
  generated_at timestamptz not null default now(),
  constraint workspace_trend_report_cache_platform_check check (platform in ('all', 'instagram', 'facebook')),
  constraint workspace_trend_report_cache_depth_check check (depth in ('standard', 'deep'))
);

create unique index if not exists workspace_trend_report_cache_key_idx
  on public.workspace_trend_report_cache (workspace_id, topic, platform, depth);

create index if not exists workspace_trend_report_cache_generated_at_idx
  on public.workspace_trend_report_cache (generated_at);

alter table public.workspace_trend_report_cache enable row level security;

drop policy if exists "Members can read trend report cache" on public.workspace_trend_report_cache;
create policy "Members can read trend report cache"
  on public.workspace_trend_report_cache
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

-- No insert/update/delete policies: writes go through the service role only.
