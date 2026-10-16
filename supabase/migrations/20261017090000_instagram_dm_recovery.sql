-- No campaign is enabled or edited by this migration. These are delivery
-- reservations and recovery correlation, not another worker/queue.
create table public.instagram_dm_recoveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  campaign_id uuid not null references public.automations(id) on delete cascade,
  comment_id text not null,
  recipient_id text not null,
  keyword text not null check (keyword ~ '^[a-z0-9_-]{1,64}$'),
  verification_automation_id uuid not null references public.automations(id),
  workflow_version_id uuid not null references public.automation_workflow_versions(id),
  origin_run_id uuid not null references public.automation_runs(id),
  node_id text not null,
  reply_text text not null check (length(reply_text) between 1 and 220),
  meta_error jsonb not null,
  fallback_meta_error jsonb,
  status text not null default 'pending' check (status in ('pending','completed','expired')),
  fallback_status text not null default 'queued' check (fallback_status in ('queued','sending','sent','failed','unknown','suppressed')),
  recovery_run_id uuid references public.automation_runs(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, social_account_id, campaign_id, comment_id)
);
create index instagram_dm_recoveries_lookup on public.instagram_dm_recoveries(workspace_id,social_account_id,recipient_id,keyword);
create index instagram_dm_recoveries_expiry on public.instagram_dm_recoveries(expires_at) where status='pending';
create index instagram_dm_recoveries_campaign_run on public.instagram_dm_recoveries(workspace_id,campaign_id,origin_run_id);

create table public.instagram_campaign_deliveries (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  campaign_id uuid not null references public.automations(id) on delete cascade,
  kind text not null check (kind in ('fallback','resource')),
  subject_id text not null,
  claim_token uuid not null default gen_random_uuid(),
  status text not null check (status in ('sending','sent','failed','unknown')),
  provider_id text,
  meta_error jsonb,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,social_account_id,campaign_id,kind,subject_id)
);

-- Inbound replay protection persists even after a run finishes or a recovery expires.
create table public.instagram_recovery_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  message_id text not null,
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,social_account_id,message_id)
);

do $$ declare t text; begin
  foreach t in array array['instagram_dm_recoveries','instagram_campaign_deliveries','instagram_recovery_receipts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.workspace_members where user_id=(select auth.uid())))',t);
  end loop;
end $$;

alter table public.automation_execution_events drop constraint automation_execution_events_type_check;
alter table public.automation_execution_events add constraint automation_execution_events_type_check check (event_type in (
 'started','succeeded','failed','retry_scheduled','dead_lettered','suppressed','replay_requested',
 'dm_restricted','fallback_reply_queued','fallback_reply_sent','fallback_reply_failed',
 'recovery_dm_received','recovery_completed','recovery_expired','already_delivered_skipped'));

create function public.record_instagram_recovery_event(p_id uuid,p_type text,p_suffix text default '')
returns void language sql security invoker set search_path='' as $$
 insert into public.automation_execution_events(event_key,workspace_id,automation_id,run_id,source,event_type,node_id,node_type,output_redacted)
 select 'recovery:'||r.id||':'||p_type||':'||p_suffix,r.workspace_id,r.campaign_id,r.origin_run_id,'graph',p_type,r.node_id,'action_private_reply',
 jsonb_build_object('recovery_id',r.id,'recovery_run_id',r.recovery_run_id,'meta_error',r.meta_error,'fallback_meta_error',r.fallback_meta_error,'fallback_status',r.fallback_status,'expires_at',r.expires_at)
 from public.instagram_dm_recoveries r where r.id=p_id on conflict(event_key) do nothing;
$$;

create function public.instagram_recovery_events_trigger() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
   perform public.record_instagram_recovery_event(new.id,'dm_restricted');
   if new.fallback_status='queued' then perform public.record_instagram_recovery_event(new.id,'fallback_reply_queued'); end if;
 else
   if new.fallback_status is distinct from old.fallback_status then
     if new.fallback_status='sent' then perform public.record_instagram_recovery_event(new.id,'fallback_reply_sent');
     elsif new.fallback_status in ('failed','unknown') then perform public.record_instagram_recovery_event(new.id,'fallback_reply_failed'); end if;
   end if;
   if new.status is distinct from old.status and new.status in ('completed','expired') then
     perform public.record_instagram_recovery_event(new.id,'recovery_'||new.status);
   end if;
 end if;
 return new;
end $$;
create trigger instagram_recovery_events after insert or update on public.instagram_dm_recoveries for each row execute function public.instagram_recovery_events_trigger();

create function public.claim_instagram_campaign_delivery(p_workspace_id uuid,p_social_account_id uuid,p_campaign_id uuid,p_kind text,p_subject_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare token uuid; current_status text;
begin
 if not exists(select 1 from public.automations a join public.social_accounts s on s.id=a.social_account_id
   where a.id=p_campaign_id and a.workspace_id=p_workspace_id and s.workspace_id=p_workspace_id and s.id=p_social_account_id and s.platform='instagram') then raise exception 'Invalid campaign scope'; end if;
 if p_subject_id is null or length(p_subject_id)=0 then raise exception 'Missing delivery subject'; end if;
 -- When a previously live verification journey opts in, conservatively
 -- seed known historical sends before claiming. This also covers delivery
 -- through the normal confirmation button before a recovery keyword arrives.
 if p_kind='resource' then
   insert into public.instagram_campaign_deliveries(workspace_id,social_account_id,campaign_id,kind,subject_id,status,provider_id)
   select p_workspace_id,p_social_account_id,p_campaign_id,'resource',p_subject_id,'sent',e.output_redacted->>'messageId'
   from public.automation_execution_events e join public.automations a on a.id=e.automation_id and a.workspace_id=e.workspace_id
   where e.workspace_id=p_workspace_id and a.social_account_id=p_social_account_id and e.event_type='succeeded'
     and e.node_type='action_send_dm' and e.output_redacted->>'channel'='dm'
     and e.input_redacted#>>'{context,sender_id}'=p_subject_id
     and exists(select 1 from jsonb_array_elements(a.workflow_graph->'nodes') n where n->>'id'=e.node_id and n#>>'{data,config,resource_campaign_id}'=p_campaign_id::text)
   order by e.created_at desc limit 1 on conflict do nothing;
 end if;
 -- Failed/unknown/sending reservations are NEVER reclaimed automatically.
 -- A failed resource may be reviewed; a repeated keyword cannot resend it.
 insert into public.instagram_campaign_deliveries(workspace_id,social_account_id,campaign_id,kind,subject_id,status)
 values(p_workspace_id,p_social_account_id,p_campaign_id,p_kind,p_subject_id,'sending') on conflict do nothing returning claim_token into token;
 select status into current_status from public.instagram_campaign_deliveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and kind=p_kind and subject_id=p_subject_id;
 if p_kind='fallback' and token is not null then
   update public.instagram_dm_recoveries set fallback_status='sending',updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and comment_id=p_subject_id;
 elsif p_kind='resource' and current_status='sent' then
   update public.instagram_dm_recoveries set status='completed',updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and recipient_id=p_subject_id and status='pending';
 end if;
 return jsonb_build_object('claimed',token is not null,'claim_token',token,'status',current_status);
end $$;

create function public.finish_instagram_campaign_delivery(p_workspace_id uuid,p_social_account_id uuid,p_campaign_id uuid,p_kind text,p_subject_id text,p_claim_token uuid,p_status text,p_provider_id text default null,p_meta_error jsonb default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status='retryable' then
   delete from public.instagram_campaign_deliveries where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and kind=p_kind and subject_id=p_subject_id and claim_token=p_claim_token and status='sending';
   if not found then return false; end if;
   if p_kind='fallback' then update public.instagram_dm_recoveries set fallback_status='queued',updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and comment_id=p_subject_id; end if;
   return true;
 end if;
 if p_status not in ('sent','failed','unknown') or (p_status='sent' and nullif(p_provider_id,'') is null) then raise exception 'Invalid delivery result'; end if;
  update public.instagram_campaign_deliveries set status=p_status,provider_id=p_provider_id,meta_error=p_meta_error,updated_at=now()
 where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and kind=p_kind and subject_id=p_subject_id and claim_token=p_claim_token and status='sending';
 if not found then return false; end if;
 if p_kind='fallback' then
   update public.instagram_dm_recoveries set fallback_status=p_status,fallback_meta_error=p_meta_error,updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and comment_id=p_subject_id;
 elsif p_status='sent' then
   update public.instagram_dm_recoveries set status='completed',updated_at=now() where workspace_id=p_workspace_id and social_account_id=p_social_account_id and campaign_id=p_campaign_id and recipient_id=p_subject_id and status='pending';
 end if;
 return true;
end $$;

create function public.consume_instagram_recovery(p_workspace_id uuid,p_social_account_id uuid,p_sender_id text,p_keyword text,p_message_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.instagram_dm_recoveries; result jsonb; n integer; run_id uuid; delivery text;
begin
 if nullif(p_sender_id,'') is null or nullif(p_message_id,'') is null then return jsonb_build_object('handled',false); end if;
 if not exists(select 1 from public.social_accounts where id=p_social_account_id and workspace_id=p_workspace_id and platform='instagram') then return jsonb_build_object('handled',false); end if;
 -- Serialize both duplicate messages and different repeated messages from a recipient.
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
     -- Consume the inbound event AND enqueue the pinned, full verification
     -- journey in one transaction. Existing stalled-run reclaim dispatches it.
     insert into public.automation_runs(workspace_id,automation_id,workflow_version_id,status,trigger_type,trigger_context)
     values(p_workspace_id,r.verification_automation_id,r.workflow_version_id,'queued','trigger_new_message',
       jsonb_build_object('sender_id',p_sender_id,'message_id',p_message_id,'message_text',r.keyword,'recovery_id',r.id,'recovery_campaign_id',r.campaign_id)) returning id into run_id;
     update public.instagram_dm_recoveries set recovery_run_id=run_id,updated_at=now() where id=r.id;
     perform public.record_instagram_recovery_event(r.id,'recovery_dm_received',p_message_id);
     result=jsonb_build_object('handled',true,'reason','queued','run_id',run_id);
   end if;
 end if;
 insert into public.instagram_recovery_receipts(workspace_id,social_account_id,message_id,outcome) values(p_workspace_id,p_social_account_id,p_message_id,result);
 return result;
end $$;

create function public.expire_instagram_recoveries() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 update public.instagram_dm_recoveries set status='expired',updated_at=now() where id in (
   select id from public.instagram_dm_recoveries where status='pending' and expires_at<=now() order by expires_at limit 500 for update skip locked);
 get diagnostics n=row_count; return n;
end $$;

do $$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
 'record_instagram_recovery_event','instagram_recovery_events_trigger','claim_instagram_campaign_delivery','finish_instagram_campaign_delivery','consume_instagram_recovery','expire_instagram_recoveries') loop
   execute format('revoke all on function %s from public, anon, authenticated',f);
   execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;

-- Invoker + RLS: callers can aggregate only their own workspace rows.
create function public.instagram_recovery_stats(p_workspace_id uuid,p_campaign_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('restricted',count(*),'fallback_sent',count(*) filter(where fallback_status='sent'),
   'received',count(*) filter(where recovery_run_id is not null),
   'completed',count(*) filter(where status='completed'),'expired',count(*) filter(where status='expired'))
 from public.instagram_dm_recoveries where workspace_id=p_workspace_id and campaign_id=p_campaign_id;
$$;
revoke all on function public.instagram_recovery_stats(uuid,uuid) from public,anon;
grant execute on function public.instagram_recovery_stats(uuid,uuid) to authenticated,service_role;
