-- Idempotency table for Meta webhook events
-- Ensures each webhook event is processed exactly once,
-- even if Meta sends duplicate notifications.

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key TEXT UNIQUE NOT NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    received_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by event_key (already UNIQUE, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_webhook_events_key ON webhook_events(event_key);

-- Index for cleanup queries (e.g., delete events older than 7 days)
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);

-- Optional: auto-cleanup old events (older than 7 days)
-- Run periodically via pg_cron or manual cleanup job
-- DELETE FROM webhook_events WHERE received_at < now() - interval '7 days';
