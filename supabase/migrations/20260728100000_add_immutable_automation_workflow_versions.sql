-- Immutable workflow versions for durable automation execution.
--
-- The editable graph remains on public.automations for compatibility, while
-- every graph change is copied into this append-only ledger. Runs, delayed
-- continuations, and provider-action outbox rows reference the immutable row
-- that produced them so later edits cannot change queued work.

create table if not exists public.automation_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null,
  workspace_id uuid not null,
  version_number bigint not null,
  workflow_graph jsonb not null,
  graph_hash text not null,
  created_at timestamptz not null default now(),
  constraint automation_workflow_versions_number_unique
    unique (automation_id, version_number),
  constraint automation_workflow_versions_identity_unique
    unique (automation_id, id)
);

create index if not exists automation_workflow_versions_workspace_created_idx
  on public.automation_workflow_versions (workspace_id, created_at desc);

alter table public.automation_workflow_versions enable row level security;
revoke all on table public.automation_workflow_versions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on table public.automation_workflow_versions to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.automation_workflow_versions to service_role;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.workspace_members') is not null
    and exists (select 1 from pg_roles where rolname = 'authenticated')
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'automation_workflow_versions'
        and policyname = 'automation_workflow_versions_workspace_select'
    )
  then
    create policy automation_workflow_versions_workspace_select
      on public.automation_workflow_versions
      for select
      to authenticated
      using (
        workspace_id in (
          select membership.workspace_id
          from public.workspace_members as membership
          where membership.user_id = auth.uid()
        )
      );
  end if;
end
$$;

alter table public.automations
  add column if not exists current_workflow_version_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_current_workflow_version_fkey'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_current_workflow_version_fkey
      foreign key (id, current_workflow_version_id)
      references public.automation_workflow_versions(automation_id, id)
      on delete restrict;
  end if;
end
$$;

-- Backfill the editable graphs that predate this ledger.
insert into public.automation_workflow_versions (
  automation_id,
  workspace_id,
  version_number,
  workflow_graph,
  graph_hash
)
select
  automation.id,
  automation.workspace_id,
  1,
  automation.workflow_graph,
  md5(automation.workflow_graph::text)
from public.automations as automation
where automation.workflow_graph is not null
  and not exists (
    select 1
    from public.automation_workflow_versions as version
    where version.automation_id = automation.id
  );

update public.automations as automation
set current_workflow_version_id = version.id
from public.automation_workflow_versions as version
where version.automation_id = automation.id
  and version.version_number = (
    select max(latest.version_number)
    from public.automation_workflow_versions as latest
    where latest.automation_id = automation.id
  )
  and automation.current_workflow_version_id is distinct from version.id;

create or replace function public.capture_automation_workflow_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  captured_version_id uuid;
  captured_version_number bigint;
begin
  if tg_op = 'UPDATE'
    and new.workflow_graph is not distinct from old.workflow_graph
  then
    return new;
  end if;

  if new.workflow_graph is null then
    update public.automations
    set current_workflow_version_id = null
    where id = new.id
      and current_workflow_version_id is not null;
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1
  into captured_version_number
  from public.automation_workflow_versions
  where automation_id = new.id;

  insert into public.automation_workflow_versions (
    automation_id,
    workspace_id,
    version_number,
    workflow_graph,
    graph_hash
  )
  values (
    new.id,
    new.workspace_id,
    captured_version_number,
    new.workflow_graph,
    md5(new.workflow_graph::text)
  )
  returning id into captured_version_id;

  update public.automations
  set current_workflow_version_id = captured_version_id
  where id = new.id;

  return new;
end
$$;

drop trigger if exists automations_capture_workflow_version on public.automations;
create trigger automations_capture_workflow_version
after insert or update of workflow_graph on public.automations
for each row execute function public.capture_automation_workflow_version();

create or replace function public.reject_workflow_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Cascading cleanup is intentionally not used: version rows remain as audit
  -- history even after their editable automation is deleted.
  raise exception 'automation workflow versions are immutable';
end
$$;

drop trigger if exists automation_workflow_versions_immutable
  on public.automation_workflow_versions;
create trigger automation_workflow_versions_immutable
before update or delete on public.automation_workflow_versions
for each row execute function public.reject_workflow_version_mutation();

create or replace function public.pin_automation_execution_workflow_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and new.workflow_version_id is distinct from old.workflow_version_id
  then
    raise exception 'pinned workflow_version_id is immutable';
  end if;

  if new.workflow_version_id is null then
    select current_workflow_version_id
    into new.workflow_version_id
    from public.automations
    where id = new.automation_id;
  end if;

  if new.workflow_version_id is not null
    and not exists (
      select 1
      from public.automation_workflow_versions as version
      where version.id = new.workflow_version_id
        and version.automation_id = new.automation_id
    )
  then
    raise exception 'workflow version does not belong to automation';
  end if;

  return new;
end
$$;

-- The full application schema has these execution tables. The isolated
-- comparison stack intentionally does not, so the migration stays additive in
-- both environments.
do $$
begin
  if to_regclass('public.automation_runs') is not null then
    alter table public.automation_runs
      add column if not exists workflow_version_id uuid;

    update public.automation_runs as run
    set workflow_version_id = automation.current_workflow_version_id
    from public.automations as automation
    where automation.id = run.automation_id
      and run.workflow_version_id is null;

    if not exists (
      select 1 from pg_constraint
      where conname = 'automation_runs_workflow_version_fkey'
        and conrelid = 'public.automation_runs'::regclass
    ) then
      alter table public.automation_runs
        add constraint automation_runs_workflow_version_fkey
        foreign key (automation_id, workflow_version_id)
        references public.automation_workflow_versions(automation_id, id)
        on delete restrict;
    end if;

    create index if not exists automation_runs_workflow_version_idx
      on public.automation_runs (workflow_version_id);

    drop trigger if exists automation_runs_pin_workflow_version
      on public.automation_runs;
    create trigger automation_runs_pin_workflow_version
      before insert or update of automation_id, workflow_version_id
      on public.automation_runs
      for each row execute function public.pin_automation_execution_workflow_version();
  end if;

  if to_regclass('public.automation_scheduled_executions') is not null then
    alter table public.automation_scheduled_executions
      add column if not exists workflow_version_id uuid;

    update public.automation_scheduled_executions as execution
    set workflow_version_id = automation.current_workflow_version_id
    from public.automations as automation
    where automation.id = execution.automation_id
      and execution.workflow_version_id is null;

    if not exists (
      select 1 from pg_constraint
      where conname = 'automation_scheduled_executions_workflow_version_fkey'
        and conrelid = 'public.automation_scheduled_executions'::regclass
    ) then
      alter table public.automation_scheduled_executions
        add constraint automation_scheduled_executions_workflow_version_fkey
        foreign key (automation_id, workflow_version_id)
        references public.automation_workflow_versions(automation_id, id)
        on delete restrict;
    end if;

    create index if not exists automation_scheduled_executions_workflow_version_idx
      on public.automation_scheduled_executions (workflow_version_id);

    drop trigger if exists automation_scheduled_executions_pin_workflow_version
      on public.automation_scheduled_executions;
    create trigger automation_scheduled_executions_pin_workflow_version
      before insert or update of automation_id, workflow_version_id
      on public.automation_scheduled_executions
      for each row execute function public.pin_automation_execution_workflow_version();
  end if;
end
$$;

-- Convert the interim content hash in the outbox to a real version-row
-- reference. Keep the old value as nullable audit data for pre-migration rows.
alter table public.automation_action_outbox
  drop constraint if exists automation_action_outbox_identity_unique;

do $$
declare
  workflow_version_type text;
begin
  select data_type
  into workflow_version_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'automation_action_outbox'
    and column_name = 'workflow_version_id';

  if workflow_version_type is distinct from 'uuid' then
    alter table public.automation_action_outbox
      rename column workflow_version_id to legacy_workflow_snapshot_id;
    alter table public.automation_action_outbox
      alter column legacy_workflow_snapshot_id drop not null;
    alter table public.automation_action_outbox
      add column workflow_version_id uuid;
  end if;
end
$$;

update public.automation_action_outbox as action
set workflow_version_id = automation.current_workflow_version_id
from public.automations as automation
where automation.id = action.automation_id
  and action.workflow_version_id is null;

do $$
begin
  if exists (
    select 1
    from public.automation_action_outbox
    where workflow_version_id is null
  ) then
    raise exception 'cannot map every existing action to an immutable workflow version';
  end if;
end
$$;

alter table public.automation_action_outbox
  alter column workflow_version_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_action_outbox_workflow_version_fkey'
      and conrelid = 'public.automation_action_outbox'::regclass
  ) then
    alter table public.automation_action_outbox
      add constraint automation_action_outbox_workflow_version_fkey
      foreign key (automation_id, workflow_version_id)
      references public.automation_workflow_versions(automation_id, id)
      on delete restrict;
  end if;
end
$$;

alter table public.automation_action_outbox
  add constraint automation_action_outbox_identity_unique unique (
    provider,
    provider_event_key,
    automation_id,
    workflow_version_id,
    node_id,
    action_type,
    target_id
  );

do $$
begin
  if exists (
    select 1 from pg_roles where rolname = 'swiftflow_webhook_comparison'
  ) then
    revoke all privileges
      on table public.automation_action_outbox
      from swiftflow_webhook_comparison;

    grant insert (
      provider,
      provider_event_key,
      automation_id,
      workflow_version_id,
      node_id,
      action_type,
      target_id,
      workspace_id,
      social_account_id,
      action_payload
    )
      on table public.automation_action_outbox
      to swiftflow_webhook_comparison;

    grant select (current_workflow_version_id)
      on table public.automations
      to swiftflow_webhook_comparison;
  end if;
end
$$;

comment on table public.automation_workflow_versions is
  'Append-only workflow graph versions referenced by runs, delayed continuations, and provider action intents.';
