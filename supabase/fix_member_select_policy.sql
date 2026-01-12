-- Fix workspace_members SELECT policy for strict RLS

-- It seems verify membership check is failing in switchWorkspace.
-- The existing recursive policy "Users can view members of their workspaces" might be too complex or failing for the self-check if not optimized.
-- We will add a simpler, direct policy for users to view ONLY THEIR OWN records.

-- Drop conflicting or overlapping policies if needed, but adding this specific one usually works well as policies are OR'ed.

-- Policy: Users can always view their own membership rows
CREATE POLICY "Users can view their own membership" ON workspace_members
FOR SELECT
USING (
    auth.uid() = user_id
);

-- Note: We do NOT drop the other policy "Users can view members of their workspaces" because users still need to see OTHER members of their team.
-- Postgres combines multiple policies with OR, so if either allows access, it works.
