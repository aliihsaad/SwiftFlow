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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer', -- owner, admin, editor, viewer
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
    ai_provider TEXT DEFAULT 'gemini',
    gemini_api_key TEXT,
    openai_api_key TEXT,
    ai_model_name TEXT DEFAULT 'gemini-1.5-flash',
    ai_temperature NUMERIC DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 2048,
    timezone TEXT DEFAULT 'UTC',
    default_language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SOCIAL ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT,
    media_urls JSONB DEFAULT '[]',
    platforms JSONB DEFAULT '[]',
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, published, failed
    metrics JSONB DEFAULT '{"likes": 0, "views": 0, "shares": 0, "comments": 0}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS published_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    followers INTEGER,
    following INTEGER,
    posts_count INTEGER,
    avg_engagement_rate NUMERIC,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    published_post_id UUID REFERENCES published_posts(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    engagement_rate NUMERIC,
    synced_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

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
    content JSONB, -- { prompt, model, style, etc. }
    image_url TEXT,
    used_in_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    messages JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
INSERT INTO storage.buckets (id, name, public) 
VALUES ('post_media', 'post_media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('generated_assets', 'generated_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to storage (for demo purposes, use specific policies for production)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id in ('post_media', 'generated_assets', 'reference-images') );

create policy "Public Insert"
  on storage.objects for insert
  with check ( bucket_id in ('post_media', 'generated_assets', 'reference-images') );

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
