-- Limit repeated inbound campaign triggers using the existing durable run table.
-- Apply after workflow versions, timeline, and DM recovery migrations. No sends
-- or campaign edits are performed. Existing follower-check graphs default to 60s.
begin;

create function public.instagram_message_trigger_cooldown(p_graph jsonb)
returns integer language plpgsql immutable security invoker set search_path='' as $$
declare trigger_node jsonb; configured jsonb;
begin
  select n into trigger_node from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) n
    where n#>>'{data,type}'='trigger_new_message' limit 1;
  if not found then return 0; end if;
  configured=trigger_node#>'{data,config,recipient_cooldown_seconds}';
  if jsonb_typeof(configured)='number' and configured::text ~ '^[0-9]{1,4}$' then
    if configured::text::integer between 0 and 3600 then return configured::text::integer; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) n
    where n#>>'{data,type}'='action_condition' and n#>>'{data,config,condition_type}'='instagram_follower_status') then
    return 60;
  end if;
  return 0;
end $$;

create index automation_runs_message_recipient_idx on public.automation_runs
  (workspace_id,automation_id,(trigger_context->>'sender_id'),created_at desc)
  where trigger_type='trigger_new_message' and status<>'skipped';

create function public.guard_instagram_message_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
declare graph jsonb; account_id uuid; sender_id text; cooldown integer; reason text;
  last_admitted timestamptz; checked_at timestamptz; retry_seconds integer=0;
begin
  if new.status is distinct from 'queued' or new.trigger_type is distinct from 'trigger_new_message' then return new; end if;
  sender_id=nullif(new.trigger_context->>'sender_id','');
  if sender_id is null then return new; end if;
  select coalesce(v.workflow_graph,a.workflow_graph),a.social_account_id into graph,account_id
    from public.automations a join public.social_accounts s on s.id=a.social_account_id and s.workspace_id=a.workspace_id
    left join public.automation_workflow_versions v on v.id=new.workflow_version_id and v.automation_id=a.id
    where a.id=new.automation_id and a.workspace_id=new.workspace_id and s.platform='instagram';
  -- Worker completion replaces node_results, but preserves trigger_context.
  -- Stamp the trusted account here rather than accepting an incoming marker.
  if account_id is not null then
    new.trigger_context=jsonb_set(new.trigger_context,'{_message_trigger_account_id}',to_jsonb(account_id),true);
  end if;
  cooldown=public.instagram_message_trigger_cooldown(graph);
  if cooldown=0 then return new; end if;

  -- This lock and the run insertion share one transaction. There is no lease
  -- that can be consumed before a crash without also durably queuing the run.
  perform pg_advisory_xact_lock(hashtextextended('message-trigger:'||new.workspace_id::text||':'||account_id::text||':'||new.automation_id::text||':'||sender_id,0));
  checked_at=clock_timestamp();
  if exists(select 1 from public.automation_runs r where r.workspace_id=new.workspace_id and r.automation_id=new.automation_id
    and r.trigger_type='trigger_new_message' and r.status<>'skipped' and r.trigger_context->>'sender_id'=sender_id
    and coalesce(r.trigger_context->>'_message_trigger_account_id',account_id::text)=account_id::text
    and ((new.event_id is not null and r.event_id=new.event_id)
      or (nullif(new.trigger_context->>'message_id','') is not null and r.trigger_context->>'message_id'=new.trigger_context->>'message_id'))) then
    reason='duplicate_message';
  elsif exists(select 1 from public.automation_runs r where r.workspace_id=new.workspace_id and r.automation_id=new.automation_id
    and r.trigger_type='trigger_new_message' and r.trigger_context->>'sender_id'=sender_id and r.status in ('queued','running','waiting')
    and coalesce(r.trigger_context->>'_message_trigger_account_id',account_id::text)=account_id::text) then
    reason='recipient_in_flight';
  else
    select max(r.created_at) into last_admitted from public.automation_runs r
      where r.workspace_id=new.workspace_id and r.automation_id=new.automation_id and r.trigger_type='trigger_new_message'
      and r.trigger_context->>'sender_id'=sender_id and r.status<>'skipped'
      and coalesce(r.trigger_context->>'_message_trigger_account_id',account_id::text)=account_id::text
      and r.created_at>checked_at-make_interval(secs=>cooldown);
    if last_admitted is not null then
      reason='recipient_cooldown';
      retry_seconds=greatest(1,ceil(extract(epoch from last_admitted+make_interval(secs=>cooldown)-checked_at))::integer);
    end if;
  end if;

  if reason is not null then
    new.status='skipped';
    new.finished_at=checked_at;
    new.updated_at=checked_at;
    new.processed_count=0;
    new.dms_sent_count=0;
    new.error_count=0;
    new.error_message=null;
    new.node_results=jsonb_set(coalesce(new.node_results,'{}'::jsonb),'{_message_trigger_guard}',
      jsonb_build_object('success',true,'output',jsonb_build_object('reason',reason,'retry_after_seconds',retry_seconds)),true);
  end if;
  return new;
end $$;

-- Alphabetically follows automation_runs_pin_workflow_version: evaluate the
-- immutable graph selected for this execution, not a later editor revision.
create trigger automation_runs_throttle_message before insert on public.automation_runs
  for each row execute function public.guard_instagram_message_trigger();

create function public.record_message_trigger_suppression()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status='skipped' and new.node_results ? '_message_trigger_guard' then
    insert into public.automation_execution_events(event_key,workspace_id,automation_id,workflow_version_id,run_id,source,event_type,node_id,node_type,output_redacted)
      values('message-trigger-suppressed:'||new.id,new.workspace_id,new.automation_id,new.workflow_version_id,new.id,
        'graph','suppressed','_message_trigger_guard','trigger_new_message',new.node_results#>'{_message_trigger_guard,output}');
  end if;
  return new;
end $$;
create trigger automation_runs_record_message_suppression after insert on public.automation_runs
  for each row execute function public.record_message_trigger_suppression();

revoke all on function public.instagram_message_trigger_cooldown(jsonb),public.guard_instagram_message_trigger(),public.record_message_trigger_suppression() from public,anon,authenticated;
grant execute on function public.instagram_message_trigger_cooldown(jsonb),public.guard_instagram_message_trigger(),public.record_message_trigger_suppression() to service_role;

-- Recovery receipts must reflect whether the shared admission trigger queued
-- or suppressed the run. Ordinary message triggers and recovery share the limit.
create or replace function public.consume_instagram_recovery(p_workspace_id uuid,p_social_account_id uuid,p_sender_id text,p_keyword text,p_message_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.instagram_dm_recoveries; result jsonb; n integer; run_id uuid; delivery text; run_status text; run_results jsonb;
begin
 if nullif(p_sender_id,'') is null or nullif(p_message_id,'') is null then return jsonb_build_object('handled',false); end if;
 if not exists(select 1 from public.social_accounts where id=p_social_account_id and workspace_id=p_workspace_id and platform='instagram') then return jsonb_build_object('handled',false); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_social_account_id::text||p_sender_id,0));
 select outcome into result from public.instagram_recovery_receipts where workspace_id=p_workspace_id and social_account_id=p_social_account_id and message_id=p_message_id;
 if found then return result||jsonb_build_object('duplicate',true); end if;
 update public.instagram_dm_recoveries set status='expired',updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and recipient_id=p_sender_id and status='pending' and expires_at<=now();
 select count(distinct campaign_id) into n from public.instagram_dm_recoveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and recipient_id=p_sender_id and keyword=lower(btrim(p_keyword)) and status='pending';
 if n>1 then result=jsonb_build_object('handled',true,'reason','ambiguous');
 elsif n=0 then
   select * into r from public.instagram_dm_recoveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and recipient_id=p_sender_id and keyword=lower(btrim(p_keyword)) order by created_at desc,id limit 1;
   if not found then
     result=jsonb_build_object('handled',false);
     insert into public.instagram_recovery_receipts(workspace_id,social_account_id,message_id,outcome) values(p_workspace_id,p_social_account_id,p_message_id,result);
     return result;
   end if;
   result=jsonb_build_object('handled',true,'reason',r.status);
   if r.status='completed' then perform public.record_instagram_recovery_event(r.id,'already_delivered_skipped',p_message_id); end if;
 else
   select * into r from public.instagram_dm_recoveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and recipient_id=p_sender_id and keyword=lower(btrim(p_keyword)) and status='pending' order by created_at desc,id limit 1 for update;
   select status into delivery from public.instagram_campaign_deliveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=r.campaign_id and kind='resource' and subject_id=p_sender_id;
   if delivery is not null then
     result=jsonb_build_object('handled',true,'reason',case when delivery='sent' then 'already_delivered' else 'delivery_requires_review' end);
     if delivery='sent' then perform public.record_instagram_recovery_event(r.id,'already_delivered_skipped',p_message_id); end if;
   elsif exists(select 1 from public.automation_runs ar join public.instagram_dm_recoveries rr on rr.recovery_run_id=ar.id where rr.workspace_id=p_workspace_id and rr.social_account_id=p_social_account_id and rr.campaign_id=r.campaign_id and rr.recipient_id=p_sender_id and ar.status in ('queued','running','waiting')) then
     result=jsonb_build_object('handled',true,'reason','in_flight');
   elsif not exists(select 1 from public.automations a join public.automations c on c.id=r.campaign_id where a.id=r.verification_automation_id and a.workspace_id=p_workspace_id and a.social_account_id=p_social_account_id and a.is_active and c.is_active) then
     result=jsonb_build_object('handled',true,'reason','inactive');
   else
     insert into public.automation_runs(workspace_id,automation_id,workflow_version_id,status,trigger_type,trigger_context)
     values(p_workspace_id,r.verification_automation_id,r.workflow_version_id,'queued','trigger_new_message',
       jsonb_build_object('sender_id',p_sender_id,'message_id',p_message_id,'message_text',r.keyword,'recovery_id',r.id,'recovery_campaign_id',r.campaign_id)) returning id,status,node_results into run_id,run_status,run_results;
     if run_status='queued' then
       update public.instagram_dm_recoveries set recovery_run_id=run_id,updated_at=now() where id=r.id;
       result=jsonb_build_object('handled',true,'reason','queued','run_id',run_id);
     else
       result=jsonb_build_object('handled',true,'reason',run_results#>>'{_message_trigger_guard,output,reason}','run_id',run_id,
         'retry_after_seconds',run_results#>'{_message_trigger_guard,output,retry_after_seconds}');
     end if;
     perform public.record_instagram_recovery_event(r.id,'recovery_dm_received',p_message_id);
   end if;
 end if;
 insert into public.instagram_recovery_receipts(workspace_id,social_account_id,message_id,outcome) values(p_workspace_id,p_social_account_id,p_message_id,result);
 return result;
end $$;
commit;
