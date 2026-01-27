-- Grant permissions on comments, conversations, and messages tables

-- Comments table
GRANT ALL ON TABLE comments TO anon, authenticated, service_role;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;

-- Conversations table
GRANT ALL ON TABLE conversations TO anon, authenticated, service_role;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;

-- Messages table
GRANT ALL ON TABLE messages TO anon, authenticated, service_role;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
