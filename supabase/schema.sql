-- =============================================================================
-- Social Media Manager AI Tool - Unified Database Schema
-- =============================================================================
-- This is the reference schema for the project.
-- Run this in Supabase SQL Editor to recreate the database structure.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- WORKSPACES
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer', -- owner, admin, editor, viewer
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
    ai_provider TEXT DEFAULT 'openrouter',
    openrouter_api_key TEXT,
    gemini_api_key TEXT,
    openai_api_key TEXT,
    ai_text_model_name TEXT DEFAULT 'openai/gpt-4o-mini',
    ai_image_model_name TEXT,
    ai_model_name TEXT DEFAULT 'openai/gpt-4o-mini',
    ai_temperature NUMERIC DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 2048,
    timezone TEXT DEFAULT 'UTC',
    default_language TEXT DEFAULT 'en',
    -- Meta App Credentials (per-workspace to bypass app review)
    meta_app_id TEXT,
    meta_app_secret TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_brand_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
    
    -- Business Identity
    business_name TEXT,
    owner_name TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    
    -- Business Details
    industry TEXT,
    business_description TEXT,
    target_audience TEXT,
    brand_voice TEXT,
    
    -- Services & Offerings
    services JSONB DEFAULT '[]',
    unique_selling_points TEXT[],
    
    -- Visual Brand Assets
    logo_url TEXT,
    brand_colors JSONB DEFAULT '{}',
    reference_image_urls TEXT[],
    
    -- Social Media Context
    instagram_handle TEXT,
    facebook_page TEXT,
    content_themes TEXT[],
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_workspace ON workspace_brand_profiles(workspace_id);

-- =============================================================================
-- SOCIAL ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- instagram, facebook, tiktok, etc.
    account_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- POSTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT,
    media_urls JSONB DEFAULT '[]',
    platforms JSONB DEFAULT '[]',
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, published, failed
    last_publish_error_code TEXT,
    last_publish_error_message TEXT,
    last_publish_attempted_at TIMESTAMPTZ,
    last_publish_results JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{"likes": 0, "views": 0, "shares": 0, "comments": 0}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS published_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    platform VARCHAR NOT NULL,
    platform_post_id VARCHAR NOT NULL,
    permalink VARCHAR,
    published_at TIMESTAMP DEFAULT now()
);

-- =============================================================================
-- ANALYTICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    followers INTEGER,
    following INTEGER,
    posts_count INTEGER,
    avg_engagement_rate NUMERIC,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_post_id UUID UNIQUE NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    engagement_rate NUMERIC,
    synced_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add unique constraint for account analytics upserts
ALTER TABLE account_analytics
ADD CONSTRAINT account_analytics_social_account_date_unique
UNIQUE (social_account_id, date);

-- =============================================================================
-- COMMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    account_id TEXT,
    published_post_id UUID REFERENCES published_posts(id) ON DELETE CASCADE,
    platform_comment_id TEXT NOT NULL,
    platform_post_id TEXT NOT NULL,
    parent_comment_id UUID REFERENCES comments(id),
    author_id TEXT,
    author_username TEXT,
    author_profile_picture TEXT,
    message TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    replied_at TIMESTAMPTZ,
    platform_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, platform_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comments_workspace ON comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_comments_social_account ON comments(social_account_id);
CREATE INDEX IF NOT EXISTS idx_comments_account_id ON comments(account_id);
CREATE INDEX IF NOT EXISTS idx_comments_published_post ON comments(published_post_id);
CREATE INDEX IF NOT EXISTS idx_comments_platform_created ON comments(platform_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);

-- =============================================================================
-- MESSAGES (Instagram DMs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform_conversation_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    participant_username TEXT,
    participant_profile_picture TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, platform_conversation_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    platform_message_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    is_from_page BOOLEAN DEFAULT FALSE,
    message TEXT,
    attachments JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    platform_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, platform_message_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_social_account ON conversations(social_account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_platform_created ON messages(platform_created_at DESC);

-- =============================================================================
-- AI ASSISTANT
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS generated_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'image', 'content_idea', 'carousel'
    source TEXT DEFAULT 'gemini', -- 'gemini', 'unsplash'
    content JSONB, -- { prompt, model, style, etc. }
    image_url TEXT,
    unsplash_id TEXT, -- Unsplash photo ID
    attribution JSONB, -- { photographer, username, profileUrl, portfolioUrl }
    used_in_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    messages JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    used_in_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now()
);

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================
-- Run in Supabase Dashboard -> Storage:
-- 1. Create bucket: "generated_assets" (Public)
-- 2. Create bucket: "reference-images" (Public)
-- 3. Create bucket: "post_media" (Public)
-- 4. Create bucket: "brand_assets" (Public)

INSERT INTO storage.buckets (id, name, public) 
VALUES ('post_media', 'post_media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('generated_assets', 'generated_assets', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand_assets', 'brand_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to storage (for demo purposes, use specific policies for production)
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING ( bucket_id IN ('post_media', 'generated_assets', 'reference-images', 'brand_assets') );

CREATE POLICY "Public Insert"
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id IN ('post_media', 'generated_assets', 'reference-images', 'brand_assets') );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION is_member_of(workspace_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = workspace_id_param
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- ROW LEVEL SECURITY (Optional for internal tools)
-- =============================================================================
-- RLS policies can be added here if needed.
-- For internal/personal use, you may disable RLS on tables.

-- Example to disable RLS on a table:
-- ALTER TABLE posts DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PERMISSIONS (Required for API access)
-- =============================================================================

-- Ensure read/write access for workspace_brand_profiles
GRANT ALL ON TABLE workspace_brand_profiles TO anon, authenticated, service_role;
ALTER TABLE workspace_brand_profiles DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE chat_sessions TO anon, authenticated, service_role;
ALTER TABLE chat_sessions DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE generated_assets TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE generated_assets TO authenticated;

-- =============================================================================
-- EXTERNAL SERVICES
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    website TEXT,
    email TEXT,
    password TEXT,
    subscription_tier TEXT,
    price TEXT,
    api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Permissions
GRANT ALL ON TABLE external_services TO anon, authenticated, service_role;
ALTER TABLE external_services DISABLE ROW LEVEL SECURITY;
