-- Add dm_channel column to track which DM delivery path was used
-- Values: 'dm' (normal DM), 'private_reply' (fallback via comment_id), or NULL
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS dm_channel TEXT;
