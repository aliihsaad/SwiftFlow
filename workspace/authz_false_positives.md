# Authorization False Positives

## AUTHZ-VULN-01: Missing Workspace Filter on Message UPDATE Operations

**Vulnerability ID:** AUTHZ-VULN-01
**Type:** Horizontal (IDOR)
**Endpoint:** GET /api/messages?conversationId=[id]
**Code Location:** app/api/messages/route.ts:56-66

**What Was Attempted:**
- Promoted User 2 (pentest_viewer@test.com) to editor in Workspace A (793cf183-0da9-4374-8717-52efbc9009d9)
- Created a "victim" workspace (Workspace C) with a test conversation having unread_count=10
- Executed GET /api/messages?conversationId=[workspace_C_conv_id] with User 2's session and active_workspace_id=workspace_A
- Verified unread_count before and after attack

**Why It Is A False Positive:**
Supabase Row-Level Security (RLS) policy `"Users can update conversations in their workspace"` on the `conversations` table enforces:
```sql
USING (workspace_id IN (
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
))
```
Since User 2 is not a member of Workspace C, the UPDATE is a no-op at the database level. The RLS policy is a security implementation specifically designed to prevent cross-workspace data access.

**Result:** unread_count remained 10 after attack. Exploit failed.

**Bypass Attempts:**
1. Promoted User 2 to editor role (to get content:write) — did not help, RLS still blocked
2. Tested with active_workspace_id set to attacker's workspace (workspace A) — RLS uses auth.uid() not workspace cookie
3. Confirmed the application code has no workspace_id filter on UPDATE lines 59-60 and 63-66, but RLS compensates at DB layer

**Conclusion:** The Supabase RLS is a security implementation that successfully prevents this exploit. Classification: FALSE POSITIVE.
