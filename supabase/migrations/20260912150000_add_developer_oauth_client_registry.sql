-- Backing store for the Developer API OAuth connector.
--
-- Two gaps this closes:
--
-- 1. /api/developer/oauth/register returned a client_id but persisted nothing,
--    so /authorize had no registered redirect_uri set to compare against and
--    accepted any URI that merely started with "https://". Because the
--    authorization code encrypts the operator's raw Developer API key, an
--    attacker could craft an authorize link pointing at their own host, have a
--    workspace owner approve it on the genuine SwiftFlow origin, and receive a
--    code that exchanges into full API access. Exact redirect_uri matching
--    against a registered client is the control that prevents this.
--
-- 2. Authorization codes were verified purely by decryption, with no server
--    side record, so a code stayed replayable for its full 10 minute TTL even
--    after the legitimate client redeemed it.
--
-- Both tables are service_role only. The OAuth routes reach them through the
-- admin client; no browser role needs access.

create table if not exists public.developer_oauth_clients (
    client_id text primary key,
    client_name text,
    redirect_uris text[] not null default '{}',
    scope text,
    created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.developer_oauth_clients is
    'Dynamically registered OAuth clients for the Developer API connector. redirect_uris is the exact-match allowlist enforced by /api/developer/oauth/authorize.';

alter table public.developer_oauth_clients enable row level security;
revoke all on table public.developer_oauth_clients from public, anon, authenticated;
grant all on table public.developer_oauth_clients to service_role;

-- Single-use authorization codes. A code carries a jti; redeeming it inserts
-- that jti here, and the primary key makes a second redemption fail.
create table if not exists public.developer_oauth_used_codes (
    jti uuid primary key,
    client_id text,
    redeemed_at timestamptz not null default timezone('utc'::text, now()),
    expires_at timestamptz not null
);

comment on table public.developer_oauth_used_codes is
    'Redeemed authorization code identifiers. Rows may be pruned once expires_at has passed; the code TTL is 10 minutes.';

create index if not exists developer_oauth_used_codes_expires_at_idx
    on public.developer_oauth_used_codes (expires_at);

alter table public.developer_oauth_used_codes enable row level security;
revoke all on table public.developer_oauth_used_codes from public, anon, authenticated;
grant all on table public.developer_oauth_used_codes to service_role;
