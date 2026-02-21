-- Phase 2 cleanup: drop legacy handled_comments table
-- Confirmed by owner: table was manual for earlier n8n automation testing.

BEGIN;

DROP TABLE IF EXISTS public.handled_comments;

COMMIT;
