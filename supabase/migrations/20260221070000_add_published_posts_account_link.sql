-- Track source account for published_posts so analytics can include
-- posts published directly on Instagram/Facebook (outside this app).

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS social_account_id uuid;

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS platform_caption text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'published_posts_social_account_id_fkey'
  ) THEN
    ALTER TABLE public.published_posts
      ADD CONSTRAINT published_posts_social_account_id_fkey
      FOREIGN KEY (social_account_id)
      REFERENCES public.social_accounts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_published_posts_social_account_id
  ON public.published_posts(social_account_id);

CREATE INDEX IF NOT EXISTS idx_published_posts_published_at
  ON public.published_posts(published_at DESC);

-- Backfill social_account_id for app-published rows when possible.
WITH account_map AS (
  SELECT DISTINCT ON (workspace_id, platform)
    id AS social_account_id,
    workspace_id,
    platform
  FROM public.social_accounts
  ORDER BY workspace_id, platform, created_at ASC
)
UPDATE public.published_posts pp
SET social_account_id = am.social_account_id
FROM public.posts p
JOIN account_map am
  ON am.workspace_id = p.workspace_id
WHERE pp.post_id = p.id
  AND am.platform = pp.platform
  AND pp.social_account_id IS NULL;
