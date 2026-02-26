create table if not exists public.workspace_invites (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    email text not null,
    role text not null default 'viewer',
    invited_by uuid not null references auth.users(id) on delete cascade,
    token text not null unique,
    status text not null default 'pending',
    expires_at timestamptz not null default (now() + interval '7 days'),
    accepted_at timestamptz,
    accepted_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint workspace_invites_role_check check (
        role = any (array['admin'::text, 'editor'::text, 'viewer'::text])
    ),
    constraint workspace_invites_status_check check (
        status = any (array['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])
    )
);

create index if not exists idx_workspace_invites_workspace on public.workspace_invites(workspace_id);
create index if not exists idx_workspace_invites_workspace_status on public.workspace_invites(workspace_id, status);
create index if not exists idx_workspace_invites_expires_at on public.workspace_invites(expires_at);
create index if not exists idx_workspace_invites_email_lower on public.workspace_invites(lower(email));

create unique index if not exists uniq_workspace_invites_pending_email
    on public.workspace_invites (workspace_id, lower(email))
    where status = 'pending';

alter table public.workspace_invites enable row level security;

drop policy if exists "Users can view invites in their workspaces" on public.workspace_invites;
drop policy if exists "Owners can view invites" on public.workspace_invites;
create policy "Owners can view invites"
    on public.workspace_invites
    for select
    using (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.workspace_invites.workspace_id
              and user_id = auth.uid()
              and role = 'owner'
        )
    );

drop policy if exists "Owners can create invites" on public.workspace_invites;
create policy "Owners can create invites"
    on public.workspace_invites
    for insert
    with check (
        invited_by = auth.uid()
        and exists (
            select 1
            from public.workspace_members
            where workspace_id = public.workspace_invites.workspace_id
              and user_id = auth.uid()
              and role = 'owner'
        )
    );

drop policy if exists "Owners can update invites" on public.workspace_invites;
create policy "Owners can update invites"
    on public.workspace_invites
    for update
    using (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.workspace_invites.workspace_id
              and user_id = auth.uid()
              and role = 'owner'
        )
    )
    with check (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.workspace_invites.workspace_id
              and user_id = auth.uid()
              and role = 'owner'
        )
    );

drop policy if exists "Owners can delete invites" on public.workspace_invites;
create policy "Owners can delete invites"
    on public.workspace_invites
    for delete
    using (
        exists (
            select 1
            from public.workspace_members
            where workspace_id = public.workspace_invites.workspace_id
              and user_id = auth.uid()
              and role = 'owner'
        )
    );

grant all on table public.workspace_invites to authenticated;
grant all on table public.workspace_invites to service_role;
