alter table public.workspace_settings
  add column if not exists floating_assistant_enabled boolean not null default false;

notify pgrst, 'reload schema';
