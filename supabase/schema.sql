-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'My Workspace',
  business_name VARCHAR(255),
  business_description TEXT,
  tone_of_voice TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  default_hashtags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Social Accounts
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL, -- 'instagram' or 'facebook'
  platform_user_id VARCHAR(255) NOT NULL,
  platform_username VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB, -- {page_id: "...", page_name: "...", followers: 123}
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, platform, platform_user_id)
);

-- Posts
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL, -- 'draft', 'scheduled', 'posted', 'failed'
  content TEXT NOT NULL,
  media_urls TEXT[],
  media_type VARCHAR(20), -- 'image', 'video', 'carousel'
  platforms JSONB NOT NULL, -- {"instagram": true, "facebook": true}
  scheduled_for TIMESTAMP,
  posted_at TIMESTAMP,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_pattern VARCHAR(50), -- 'daily', 'weekly', 'monthly'
  quality_score INTEGER,
  quality_breakdown JSONB, -- {structure: 75, engagement: 65, ...}
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Published Posts (track actual posted content)
CREATE TABLE published_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  platform_post_id VARCHAR(255) NOT NULL,
  permalink VARCHAR(500),
  published_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, platform_post_id)
);

-- Analytics (synced from platforms)
CREATE TABLE post_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  published_post_id UUID REFERENCES published_posts(id) ON DELETE CASCADE,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2),
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Account Analytics (daily snapshots)
CREATE TABLE account_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  followers INTEGER,
  following INTEGER,
  posts_count INTEGER,
  avg_engagement_rate DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(social_account_id, date)
);

-- AI Conversations
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  messages JSONB NOT NULL, -- [{role: "user", content: "..."}, ...]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Generated Images (Nano Banana)
CREATE TABLE generated_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  used_in_post_id UUID REFERENCES posts(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Row Level Security (RLS) Policies (Basic Setup)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own workspaces" ON workspaces FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own workspaces" ON workspaces FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workspaces" ON workspaces FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view social accounts via workspace" ON social_accounts FOR SELECT USING (EXISTS (SELECT 1 FROM workspaces WHERE id = social_accounts.workspace_id AND user_id = auth.uid()));

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view posts via workspace" ON posts FOR SELECT USING (EXISTS (SELECT 1 FROM workspaces WHERE id = posts.workspace_id AND user_id = auth.uid()));

-- (Add more policies as needed for other tables)
