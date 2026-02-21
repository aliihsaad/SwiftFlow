-- Phase 1 cleanup: drop confirmed unused + empty legacy tables
-- Verified by audit on 2026-02-21:
-- - public.ai_conversations exact_count = 0
-- - public.generated_images exact_count = 0

BEGIN;

DROP TABLE IF EXISTS public.ai_conversations;
DROP TABLE IF EXISTS public.generated_images;

COMMIT;
