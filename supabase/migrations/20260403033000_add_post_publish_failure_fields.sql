alter table public.posts
add column if not exists last_publish_error_code text,
add column if not exists last_publish_error_message text,
add column if not exists last_publish_attempted_at timestamptz,
add column if not exists last_publish_results jsonb not null default '[]'::jsonb;
