-- Phase 3 cleanup: drop instagram_comments_raw
-- Owner decision: remove in test mode; can recreate later if needed.

BEGIN;

DROP TABLE IF EXISTS public.instagram_comments_raw;

COMMIT;
