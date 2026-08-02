\set ON_ERROR_STOP on

insert into public.workspaces (id, name)
values (
  '10000000-0000-4000-8000-000000000001',
  'SwiftFlow isolated staging'
);

insert into public.social_accounts (
  id,
  workspace_id,
  platform,
  account_id,
  access_token,
  refresh_token,
  metadata
)
values (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'instagram',
  '17841400000000000',
  'staging-token-must-not-be-readable',
  'staging-refresh-must-not-be-readable',
  '{"connected_page_id":"100000000000000"}'::jsonb
);

insert into public.automations (
  id,
  workspace_id,
  social_account_id,
  is_active,
  editor_version,
  workflow_graph
)
values (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  true,
  'canvas',
  '{
    "nodes": [
      {
        "id": "trigger-comment",
        "data": {
          "type": "trigger_new_comment",
          "config": {
            "social_account_id": "10000000-0000-4000-8000-000000000002",
            "trigger_type": "keywords",
            "keywords": ["swiftflow"],
            "post_scope": "any"
          }
        }
      },
      {
        "id": "private-reply",
        "data": {
          "type": "action_private_reply",
          "config": {
            "message": "Synthetic staging response"
          }
        }
      }
    ],
    "edges": [
      {
        "source": "trigger-comment",
        "target": "private-reply"
      }
    ]
  }'::jsonb
);

insert into public.webhook_inbox_events (
  provider,
  provider_event_key,
  provider_object,
  event_type,
  account_external_id,
  delivery_hash,
  payload
)
values (
  'meta',
  'staging:synthetic:comment:1',
  'instagram',
  'comments',
  '17841400000000000',
  repeat('a', 64),
  '{
    "transport": "changes",
    "change": {
      "field": "comments",
      "value": {
        "id": "staging-comment-1",
        "text": "Please send the SwiftFlow details",
        "from": {
          "id": "staging-user-1",
          "username": "staging_tester"
        },
        "media": {
          "id": "staging-post-1",
          "media_product_type": "FEED"
        }
      }
    }
  }'::jsonb
);
