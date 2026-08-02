-- Keep stored Developer API keys aligned with SwiftFlow's engagement-only API.
-- Legacy publishing, media-generation, and content-intelligence scopes are
-- removed. Active keys that would otherwise have no capability are revoked.

alter table public.workspace_api_keys
  drop constraint if exists workspace_api_keys_scopes_nonempty;

with normalized as (
  select
    id,
    array(
      select scope
      from unnest(coalesce(scopes, '{}'::text[])) as scope
      where scope = any (array[
        'workspace:read',
        'brand:read',
        'brand:write',
        'automations:read',
        'automations:create',
        'automations:update',
        'automations:toggle',
        'automations:delete',
        'analytics:read'
      ]::text[])
    ) as supported_scopes
  from public.workspace_api_keys
)
update public.workspace_api_keys as api_key
set
  scopes = normalized.supported_scopes,
  status = case
    when api_key.status = 'active' and cardinality(normalized.supported_scopes) = 0 then 'revoked'
    else api_key.status
  end,
  revoked_at = case
    when api_key.status = 'active' and cardinality(normalized.supported_scopes) = 0
      then coalesce(api_key.revoked_at, now())
    else api_key.revoked_at
  end,
  revoked_reason = case
    when api_key.status = 'active' and cardinality(normalized.supported_scopes) = 0
      then coalesce(api_key.revoked_reason, 'legacy_scopes_removed')
    else api_key.revoked_reason
  end,
  updated_at = now()
from normalized
where api_key.id = normalized.id
  and api_key.scopes is distinct from normalized.supported_scopes;

alter table public.workspace_api_keys
  add constraint workspace_api_keys_scopes_nonempty
  check (
    status <> 'active'
    or cardinality(scopes) >= 1
  );
