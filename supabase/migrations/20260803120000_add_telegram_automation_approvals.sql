-- Telegram workspace integration plus durable, idempotent approval gates.

alter table public.workspace_settings
  add column if not exists telegram_bot_token text,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_webhook_secret text,
  add column if not exists telegram_bot_id text,
  add column if not exists telegram_bot_username text,
  add column if not exists telegram_bot_name text,
  add column if not exists telegram_verified_at timestamptz;

create table if not exists public.automation_approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  workflow_version_id uuid not null references public.automation_workflow_versions(id) on delete restrict,
  run_id uuid references public.automation_runs(id) on delete cascade,
  node_id text not null,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'failed'::text])),
  execution_context jsonb not null default '{}'::jsonb,
  approved_next_nodes jsonb not null default '[]'::jsonb,
  rejected_next_nodes jsonb not null default '[]'::jsonb,
  telegram_message_id bigint,
  decided_by_telegram_user_id text,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_approval_requests_next_nodes_arrays check (
    jsonb_typeof(approved_next_nodes) = 'array'
    and jsonb_typeof(rejected_next_nodes) = 'array'
  )
);

create index if not exists automation_approval_requests_pending_expiry_idx
  on public.automation_approval_requests(expires_at, created_at)
  where status = 'pending';

create index if not exists automation_approval_requests_run_idx
  on public.automation_approval_requests(run_id, created_at desc);

alter table public.automation_approval_requests enable row level security;

revoke all on table public.automation_approval_requests from public, anon, authenticated;
grant all on table public.automation_approval_requests to service_role;

create or replace function public.resolve_telegram_approval_request(
  p_request_id uuid,
  p_workspace_id uuid,
  p_decision text,
  p_telegram_user_id text
)
returns table (
  request_id uuid,
  resolution_status text,
  scheduled_execution_id uuid,
  automation_id uuid,
  node_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.automation_approval_requests%rowtype;
  v_status text;
  v_next_nodes jsonb;
  v_scheduled_id uuid;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported Telegram approval decision';
  end if;

  select * into v_request
  from public.automation_approval_requests
  where id = p_request_id and workspace_id = p_workspace_id
  for update;

  if not found then
    return;
  end if;

  if v_request.status <> 'pending' then
    return query select v_request.id, v_request.status, null::uuid, v_request.automation_id, v_request.node_id;
    return;
  end if;

  v_status := case when v_request.expires_at <= v_now then 'expired' else p_decision end;
  v_next_nodes := case
    when v_status = 'approved' then v_request.approved_next_nodes
    else v_request.rejected_next_nodes
  end;

  update public.automation_approval_requests
  set status = v_status,
      decided_by_telegram_user_id = p_telegram_user_id,
      decided_at = v_now,
      updated_at = v_now
  where id = v_request.id;

  if jsonb_array_length(v_next_nodes) > 0 then
    v_scheduled_id := gen_random_uuid();
    insert into public.automation_scheduled_executions (
      id, automation_id, workflow_version_id, execution_id, node_id,
      execution_context, scheduled_for, status
    ) values (
      v_scheduled_id,
      v_request.automation_id,
      v_request.workflow_version_id,
      gen_random_uuid(),
      v_request.node_id,
      v_request.execution_context || jsonb_build_object(
        'next_nodes', v_next_nodes,
        'telegram_approval', jsonb_build_object(
          'request_id', v_request.id,
          'decision', v_status,
          'decided_at', v_now
        )
      ),
      v_now,
      'pending'
    );
  elsif v_request.run_id is not null then
    perform public.apply_automation_run_continuation_result(
      v_request.run_id, '{}'::jsonb, 0, 0, 0, 0, null
    );
  end if;

  return query select v_request.id, v_status, v_scheduled_id, v_request.automation_id, v_request.node_id;
end;
$$;

revoke all on function public.resolve_telegram_approval_request(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_telegram_approval_request(uuid, uuid, text, text)
  to service_role;

create or replace function public.expire_due_telegram_approval_requests(
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.automation_approval_requests%rowtype;
  v_count integer := 0;
begin
  for v_request in
    select *
    from public.automation_approval_requests
    where status = 'pending' and expires_at <= now()
    order by expires_at asc
    limit least(greatest(coalesce(p_limit, 1), 1), 100)
    for update skip locked
  loop
    perform 1 from public.resolve_telegram_approval_request(
      v_request.id, v_request.workspace_id, 'rejected', 'system:expired'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_due_telegram_approval_requests(integer)
  from public, anon, authenticated;
grant execute on function public.expire_due_telegram_approval_requests(integer)
  to service_role;
