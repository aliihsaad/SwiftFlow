#!/usr/bin/env sh
# Seeds the isolated staging database with a Meta tester account and one
# comment-to-private-reply automation, so a real webhook can be compared against
# an expected automation.
#
# The stored access token is a deliberate placeholder. Never put a real Meta
# token here: both the ingress and comparison roles are forbidden from reading
# token columns, and the deployed verifiers prove it.
#
# Usage, run on the staging host:
#   sh seed-tester-account.sh <webhook_account_id> [keyword] [instagram_login_user_id]
#
# Re-running is safe: the tester rows use fixed UUIDs and are replaced in place.
set -eu

webhook_account_id="${1:?Pass entry[].id from a real Instagram webhook}"
keyword="${2:-swiftflow}"
instagram_login_user_id="${3:-$webhook_account_id}"

case "$webhook_account_id" in
  *[!0-9]*) echo "Webhook account ID must be numeric" >&2; exit 1 ;;
esac
case "$instagram_login_user_id" in
  *[!0-9]*) echo "Instagram Login user ID must be numeric" >&2; exit 1 ;;
esac

psql \
  --set=ON_ERROR_STOP=1 \
  --set=webhook_account_id="$webhook_account_id" \
  --set=ig_user_id="$instagram_login_user_id" \
  --set=keyword="$keyword" \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-swiftflow_staging}" <<'SQL'
begin;

insert into public.workspaces (id, name)
values ('20000000-0000-4000-8000-000000000001', 'SwiftFlow Meta tester')
on conflict (id) do update set name = excluded.name;

delete from public.automations
where id = '20000000-0000-4000-8000-000000000003';
delete from public.social_accounts
where id = '20000000-0000-4000-8000-000000000002';

insert into public.social_accounts (
  id, workspace_id, platform, account_id, access_token, refresh_token, metadata
)
values (
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'instagram',
  :'webhook_account_id',
  'placeholder-not-a-real-token',
  'placeholder-not-a-real-token',
  jsonb_build_object(
    'ig_user_id', :'ig_user_id',
    'webhook_account_id', :'webhook_account_id',
    'login_mode', 'instagram_login'
  )
);

insert into public.automations (
  id, workspace_id, social_account_id, is_active, editor_version, workflow_graph
)
values (
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  true,
  'canvas',
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'tester-trigger',
        'data', jsonb_build_object(
          'type', 'trigger_new_comment',
          'config', jsonb_build_object(
            'social_account_id', '20000000-0000-4000-8000-000000000002',
            'trigger_type', 'keywords',
            'keywords', jsonb_build_array(:'keyword'),
            'post_scope', 'any'
          )
        )
      ),
      jsonb_build_object(
        'id', 'tester-private-reply',
        'data', jsonb_build_object(
          'type', 'action_private_reply',
          'config', jsonb_build_object(
            'message', 'Dry-run only. This message is never sent.'
          )
        )
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('source', 'tester-trigger', 'target', 'tester-private-reply')
    )
  )
);

commit;

select
  account.account_id as seeded_webhook_account_id,
  account.metadata ->> 'ig_user_id' as seeded_instagram_login_user_id,
  automation.id as seeded_automation_id,
  automation.workflow_graph -> 'nodes' -> 0 -> 'data' -> 'config' -> 'keywords' as keywords
from public.social_accounts as account
join public.automations as automation
  on automation.social_account_id = account.id
where account.id = '20000000-0000-4000-8000-000000000002';
SQL
