-- One shared reservation for manual and managed-automation private replies.
-- Sending/unknown claims never expire automatically: Meta may have accepted
-- the message even if the caller lost the response.
create table public.instagram_private_reply_deliveries (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  comment_id text not null,
  claim_token uuid not null default gen_random_uuid(),
  status text not null check (status in ('sending', 'sent', 'failed', 'unknown')),
  source text not null check (source in ('manual', 'automation')),
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, social_account_id, comment_id)
);

alter table public.instagram_private_reply_deliveries enable row level security;
revoke all on public.instagram_private_reply_deliveries from public, anon, authenticated;
grant select on public.instagram_private_reply_deliveries to authenticated;
grant all on public.instagram_private_reply_deliveries to service_role;
create policy private_reply_workspace_read on public.instagram_private_reply_deliveries
  for select to authenticated using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );

-- Carry forward known successful sends, including Send DM's private fallback.
-- Messages sent outside SwiftFlow remain subject to Meta's one-reply check.
insert into public.instagram_private_reply_deliveries
  (workspace_id, social_account_id, comment_id, status, source, message_id, created_at, updated_at)
select distinct on (e.workspace_id, a.social_account_id, e.input_redacted #>> '{context,comment_id}')
  e.workspace_id, a.social_account_id, e.input_redacted #>> '{context,comment_id}',
  'sent', 'automation', e.output_redacted ->> 'messageId', e.created_at, e.created_at
from public.automation_execution_events e
join public.automations a on a.id = e.automation_id and a.workspace_id = e.workspace_id
where e.event_type = 'succeeded' and e.output_redacted ->> 'channel' = 'private_reply'
  and nullif(e.input_redacted #>> '{context,comment_id}', '') is not null
  and a.social_account_id is not null
  and e.created_at >= now() - interval '8 days'
order by e.workspace_id, a.social_account_id, e.input_redacted #>> '{context,comment_id}', e.created_at desc
on conflict do nothing;

create function public.claim_instagram_private_reply(
  p_workspace_id uuid, p_social_account_id uuid, p_comment_id text, p_source text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_claim uuid; v_status text;
begin
  if not exists (select 1 from public.social_accounts
    where id = p_social_account_id and workspace_id = p_workspace_id and platform = 'instagram') then
    raise exception 'Invalid private reply account scope';
  end if;
  insert into public.instagram_private_reply_deliveries as d
    (workspace_id, social_account_id, comment_id, source, status)
  values (p_workspace_id, p_social_account_id, p_comment_id, p_source, 'sending')
  on conflict (workspace_id, social_account_id, comment_id) do update
    set status = 'sending', claim_token = gen_random_uuid(), source = excluded.source, updated_at = now()
    where d.status = 'failed'
  returning claim_token into v_claim;
  if v_claim is not null then
    return jsonb_build_object('claimed', true, 'claimToken', v_claim, 'status', 'sending');
  end if;
  select status into v_status from public.instagram_private_reply_deliveries
    where workspace_id = p_workspace_id and social_account_id = p_social_account_id and comment_id = p_comment_id;
  return jsonb_build_object('claimed', false, 'status', v_status);
end;
$$;

create function public.finish_instagram_private_reply(
  p_workspace_id uuid, p_social_account_id uuid, p_comment_id text,
  p_claim_token uuid, p_status text, p_message_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('sent', 'failed', 'unknown') then raise exception 'Invalid delivery status'; end if;
  update public.instagram_private_reply_deliveries
    set status = p_status, message_id = p_message_id, updated_at = now()
    where workspace_id = p_workspace_id and social_account_id = p_social_account_id
      and comment_id = p_comment_id and claim_token = p_claim_token and status = 'sending';
  return found;
end;
$$;

revoke all on function public.claim_instagram_private_reply(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finish_instagram_private_reply(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_instagram_private_reply(uuid, uuid, text, text) to service_role;
grant execute on function public.finish_instagram_private_reply(uuid, uuid, text, uuid, text, text) to service_role;
