-- MASTER REBUILD SCRIPT
-- This script resets and rebuilds the database schema to perfectly align with the frontend requirements.
-- It prioritizes simplicity and correctness over complex security hierarchies.

-- =====================================================================================
-- 1. CLEANUP (Drop everything to start fresh)
-- =====================================================================================

DROP TABLE IF EXISTS analytics_snapshots CASCADE;
DROP TABLE IF EXISTS social_accounts CASCADE; -- Renamed from social_connections for consistency
DROP TABLE IF EXISTS social_connections CASCADE; -- Drop old name just in case
DROP TABLE IF EXISTS workspace_settings CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================================
-- 2. TABLES
-- =====================================================================================

-- 2.1 Workspaces
-- Core container for all data
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.2 Workspace Members
-- Who can access the workspace?
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- 2.3 Workspace Settings
-- Configuration for AI, etc.
CREATE TABLE workspace_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- AI Configuration
    ai_provider TEXT DEFAULT 'gemini',
    gemini_api_key TEXT,
    openai_api_key TEXT,
    ai_model_name TEXT DEFAULT 'gemini-1.5-flash',
    ai_temperature NUMERIC DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 2048,
    
    -- Localization
    timezone TEXT DEFAULT 'UTC',
    default_language TEXT DEFAULT 'en',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id)
);

-- 2.4 Social Accounts
-- Connected platforms (Instagram, Facebook, etc.)
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'twitter')),
    account_name TEXT NOT NULL,
    account_id TEXT NOT NULL, -- Platform specific ID
    access_token TEXT, -- Encrypt in app level if needed, or rely on RLS
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata (Page ID, Profile Picture, Follower Count, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.5 Posts
-- Content to be posted
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    content TEXT,
    media_urls JSONB DEFAULT '[]'::jsonb, -- Array of strings
    platforms JSONB DEFAULT '[]'::jsonb, -- Array of strings: ['instagram', 'facebook']
    
    scheduled_for TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
    
    -- Analytics for this specific post
    metrics JSONB DEFAULT '{"views": 0, "likes": 0, "comments": 0, "shares": 0}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.6 Analytics Snapshots
-- Daily snapshots of account-level metrics for graphs
CREATE TABLE analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Snapshot data
    metrics JSONB DEFAULT '{}'::jsonb, -- { "followers": 1200, "impressions": 500 }
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, platform, date)
);

-- =====================================================================================
-- 3. UPDATED_AT TRIGGERS
-- =====================================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspace_settings_updated_at BEFORE UPDATE ON workspace_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON social_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- 4. AUTO-CREATE SETTINGS TRIGGER
-- =====================================================================================

-- Automatically create settings when a workspace is created
CREATE OR REPLACE FUNCTION create_default_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO workspace_settings (workspace_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_workspace_created
    AFTER INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION create_default_settings();

-- =====================================================================================
-- 5. ROW LEVEL SECURITY (SIMPLIFIED)
-- =====================================================================================

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- 5.1 Workspaces Policies
-- View: If you are the owner OR a member
CREATE POLICY "View workspaces" ON workspaces FOR SELECT USING (
    auth.uid() = owner_id OR 
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = workspaces.id AND user_id = auth.uid())
);
-- Create: Anyone authenticated
CREATE POLICY "Create workspaces" ON workspaces FOR INSERT WITH CHECK (auth.uid() = owner_id);
-- Update/Delete: Only Owner
CREATE POLICY "Manage workspaces" ON workspaces FOR ALL USING (auth.uid() = owner_id);

-- 5.2 Workspace Members Policies
-- View: If you are in the workspace (or it's your own membership row)
CREATE POLICY "View members" ON workspace_members FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid())
);
-- Insert: If you are the owner of the workspace (adding people) OR adding yourself (creation flow)
CREATE POLICY "Manage members" ON workspace_members FOR INSERT WITH CHECK (
    -- Adding yourself as owner to a workspace you own
    (user_id = auth.uid() AND role = 'owner' AND EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid()))
    OR
    -- Workspace owner adding others
    EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid())
);
-- Update/Delete: Workspace Owner Only
CREATE POLICY "Owner manage members" ON workspace_members FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid())
);
CREATE POLICY "Owner delete members" ON workspace_members FOR DELETE USING (
     -- Owner can delete anyone, User can delete themselves (leave)
    (EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid()))
    OR
    (user_id = auth.uid())
);

-- 5.3 GENERIC WORKSPACE CONTENT POLICY (Settings, Accounts, Posts, Analytics)
-- "If I am a member of the workspace, I can View/Create/Update/Delete"
-- This is the "Internal Tool" simplification: trust team members.

-- Settings
CREATE POLICY "Member access settings" ON workspace_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = workspace_settings.workspace_id AND user_id = auth.uid())
);

-- Social Accounts
CREATE POLICY "Member access social_accounts" ON social_accounts FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = social_accounts.workspace_id AND user_id = auth.uid())
);

-- Posts
CREATE POLICY "Member access posts" ON posts FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = posts.workspace_id AND user_id = auth.uid())
);

-- Analytics
CREATE POLICY "Member access analytics" ON analytics_snapshots FOR ALL USING (
    EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = analytics_snapshots.workspace_id AND user_id = auth.uid())
);

-- =====================================================================================
-- 6. PERMISSIONS
-- =====================================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
