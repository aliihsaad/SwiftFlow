export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Workspace {
    id: string
    name: string
    slug: string
    owner_id: string
    created_at: string
}

export interface WorkspaceMember {
    id: string
    workspace_id: string
    user_id: string
    role: WorkspaceRole
    created_at: string
}

export interface SocialConnection {
    id: string
    workspace_id: string
    platform: 'instagram'
    account_name: string
    account_id: string
    created_at: string
    meta: Record<string, unknown>
}

// Session state interface attached to requests
export interface SessionWorkspace {
    id: string
    role: WorkspaceRole
}
