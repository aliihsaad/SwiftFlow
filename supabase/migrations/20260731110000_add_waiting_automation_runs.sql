alter table public.automation_runs
  add column if not exists pending_continuation_count integer not null default 0;

alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add constraint automation_runs_status_check
  check (status = any (array[
    'queued'::text,
    'running'::text,
    'waiting'::text,
    'completed'::text,
    'failed'::text,
    'skipped'::text
  ]));

alter table public.automation_runs
  drop constraint if exists automation_runs_pending_continuation_count_check;

alter table public.automation_runs
  add constraint automation_runs_pending_continuation_count_check
  check (pending_continuation_count >= 0);

create or replace function public.apply_automation_run_continuation_result(
  p_run_id uuid,
  p_node_results jsonb,
  p_processed_count integer,
  p_dms_sent_count integer,
  p_error_count integer,
  p_pending_continuations integer,
  p_error_message text
)
returns table (
  status text,
  event_id uuid,
  workspace_id uuid,
  automation_id uuid,
  remaining_continuations integer,
  total_errors integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.automation_runs%rowtype;
  v_remaining integer;
  v_total_errors integer;
  v_status text;
  v_now timestamptz := now();
begin
  select *
  into v_run
  from public.automation_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Automation run % was not found', p_run_id;
  end if;

  v_remaining := greatest(
    0,
    coalesce(v_run.pending_continuation_count, 0)
      - 1
      + greatest(coalesce(p_pending_continuations, 0), 0)
  );
  v_total_errors := coalesce(v_run.error_count, 0) + greatest(coalesce(p_error_count, 0), 0);
  v_status := case
    when v_remaining > 0 then 'waiting'
    when v_total_errors > 0 then 'failed'
    else 'completed'
  end;

  update public.automation_runs
  set
    status = v_status,
    node_results = coalesce(node_results, '{}'::jsonb) || coalesce(p_node_results, '{}'::jsonb),
    processed_count = coalesce(processed_count, 0) + greatest(coalesce(p_processed_count, 0), 0),
    dms_sent_count = coalesce(dms_sent_count, 0) + greatest(coalesce(p_dms_sent_count, 0), 0),
    error_count = v_total_errors,
    pending_continuation_count = v_remaining,
    error_message = case
      when v_total_errors > 0 then coalesce(nullif(p_error_message, ''), error_message, 'One or more nodes failed')
      else null
    end,
    finished_at = case when v_status in ('completed', 'failed') then v_now else null end,
    updated_at = v_now
  where id = p_run_id;

  return query
  select
    v_status,
    v_run.event_id,
    v_run.workspace_id,
    v_run.automation_id,
    v_remaining,
    v_total_errors;
end;
$$;

revoke all on function public.apply_automation_run_continuation_result(
  uuid, jsonb, integer, integer, integer, integer, text
) from public, anon, authenticated;

grant execute on function public.apply_automation_run_continuation_result(
  uuid, jsonb, integer, integer, integer, integer, text
) to service_role;
