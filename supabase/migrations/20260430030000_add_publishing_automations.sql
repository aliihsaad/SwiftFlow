create table if not exists public.publishing_automations (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name text not null,
    is_active boolean not null default false,
    platforms jsonb not null default '[]'::jsonb,
    approval_mode text not null default 'manual_review',
    content_goal text not null,
    brand_voice text,
    content_pillars jsonb not null default '[]'::jsonb,
    excluded_terms jsonb not null default '[]'::jsonb,
    cta_config jsonb not null default '{}'::jsonb,
    media_policy jsonb not null default '{}'::jsonb,
    workflow_config jsonb not null default '{}'::jsonb,
    consistency_config jsonb not null default '{}'::jsonb,
    schedule_config jsonb not null default '{}'::jsonb,
    daily_cap integer not null default 1,
    next_run_at timestamptz,
    last_run_at timestamptz,
    last_error text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint publishing_automations_approval_mode_check check (
        approval_mode = any (array['manual_review'::text, 'auto_schedule'::text, 'auto_publish'::text])
    ),
    constraint publishing_automations_daily_cap_check check (daily_cap between 1 and 24)
);

create table if not exists public.publishing_automation_runs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    publishing_automation_id uuid not null references public.publishing_automations(id) on delete cascade,
    status text not null default 'queued',
    generated_post_id uuid references public.posts(id) on delete set null,
    approval_mode text not null,
    scheduled_for timestamptz,
    prompt_snapshot jsonb not null default '{}'::jsonb,
    result_snapshot jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    finished_at timestamptz,
    constraint publishing_automation_runs_status_check check (
        status = any (array['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text])
    ),
    constraint publishing_automation_runs_approval_mode_check check (
        approval_mode = any (array['manual_review'::text, 'auto_schedule'::text, 'auto_publish'::text])
    )
);

alter table public.posts
add column if not exists source_publishing_automation_id uuid references public.publishing_automations(id) on delete set null,
add column if not exists source_publishing_automation_run_id uuid references public.publishing_automation_runs(id) on delete set null;

create index if not exists idx_publishing_automations_workspace on public.publishing_automations(workspace_id);
create index if not exists idx_publishing_automations_due on public.publishing_automations(next_run_at) where is_active = true;
create index if not exists idx_publishing_automation_runs_automation on public.publishing_automation_runs(publishing_automation_id);
create index if not exists idx_publishing_automation_runs_workspace_created on public.publishing_automation_runs(workspace_id, created_at desc);
create index if not exists idx_posts_source_publishing_automation on public.posts(source_publishing_automation_id);

alter table public.publishing_automations enable row level security;
alter table public.publishing_automation_runs enable row level security;

drop policy if exists "Members can view publishing automations" on public.publishing_automations;
create policy "Members can view publishing automations"
    on public.publishing_automations
    for select
    using (public.is_member_of(workspace_id));

drop policy if exists "Admins can create publishing automations" on public.publishing_automations;
create policy "Admins can create publishing automations"
    on public.publishing_automations
    for insert
    with check (
        created_by = auth.uid()
        and exists (
            select 1
            from public.workspace_members
            where workspace_id = public.publishing_automations.workspace_id
              and user_id = auth.uid()
              and role = any (array['owner'::text, 'admin'::text])
        )
    );

drop policy if exists "Admins can update publishing automations" on public.publishing_automations;
create policy "Admins can update publishing automations"
    on public.publishing_automations
    for update
    using (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.publishing_automations.workspace_id
              and user_id = auth.uid()
              and role = any (array['owner'::text, 'admin'::text])
        )
    )
    with check (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.publishing_automations.workspace_id
              and user_id = auth.uid()
              and role = any (array['owner'::text, 'admin'::text])
        )
    );

drop policy if exists "Admins can delete publishing automations" on public.publishing_automations;
create policy "Admins can delete publishing automations"
    on public.publishing_automations
    for delete
    using (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.publishing_automations.workspace_id
              and user_id = auth.uid()
              and role = any (array['owner'::text, 'admin'::text])
        )
    );

drop policy if exists "Members can view publishing automation runs" on public.publishing_automation_runs;
create policy "Members can view publishing automation runs"
    on public.publishing_automation_runs
    for select
    using (public.is_member_of(workspace_id));

drop policy if exists "Service role can manage publishing automations" on public.publishing_automations;
create policy "Service role can manage publishing automations"
    on public.publishing_automations
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage publishing automation runs" on public.publishing_automation_runs;
create policy "Service role can manage publishing automation runs"
    on public.publishing_automation_runs
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

grant all on table public.publishing_automations to authenticated;
grant all on table public.publishing_automations to service_role;
grant select on table public.publishing_automation_runs to authenticated;
grant all on table public.publishing_automation_runs to service_role;
