-- Add unique constraint on account_analytics for social_account_id + date
-- This prevents duplicate entries when syncing follower counts daily

ALTER TABLE account_analytics
ADD CONSTRAINT account_analytics_social_account_date_unique
UNIQUE (social_account_id, date);
