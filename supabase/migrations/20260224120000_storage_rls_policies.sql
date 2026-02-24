-- Create buckets if they don't exist yet
insert into storage.buckets (id, name, public)
values
    ('post_media', 'post_media', true),
    ('generated_assets', 'generated_assets', true)
on conflict (id) do nothing;

-- ─── post_media policies ─────────────────────────────────────────────────────

-- Authenticated users can upload into the bucket
create policy "post_media: authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'post_media');

-- Anyone can read (bucket is public, but this covers the policy layer too)
create policy "post_media: public read"
on storage.objects for select
to public
using (bucket_id = 'post_media');

-- Owners can update their own objects
create policy "post_media: authenticated update"
on storage.objects for update
to authenticated
using (bucket_id = 'post_media' and auth.uid() = owner);

-- Owners can delete their own objects
create policy "post_media: authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'post_media' and auth.uid() = owner);


-- ─── generated_assets policies ───────────────────────────────────────────────

create policy "generated_assets: authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'generated_assets');

create policy "generated_assets: public read"
on storage.objects for select
to public
using (bucket_id = 'generated_assets');

create policy "generated_assets: authenticated update"
on storage.objects for update
to authenticated
using (bucket_id = 'generated_assets' and auth.uid() = owner);

create policy "generated_assets: authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'generated_assets' and auth.uid() = owner);
