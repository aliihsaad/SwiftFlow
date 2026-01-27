-- Create conversations and messages tables for Instagram DM management

-- Conversations table - represents a thread with a user
CREATE TABLE conversations (
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

-- Messages table - individual messages within conversations
CREATE TABLE messages (
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

-- Indexes for efficient querying
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_social_account ON conversations(social_account_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_unread ON conversations(unread_count) WHERE unread_count > 0;

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_messages_platform_created ON messages(platform_created_at DESC);
CREATE INDEX idx_messages_unread ON messages(is_read) WHERE is_read = FALSE;

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations in their workspace"
    ON conversations FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert conversations in their workspace"
    ON conversations FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update conversations in their workspace"
    ON conversations FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete conversations in their workspace"
    ON conversations FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their workspace"
    ON messages FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages in their workspace"
    ON messages FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in their workspace"
    ON messages FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in their workspace"
    ON messages FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at on conversations
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conversation_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_updated_at();
