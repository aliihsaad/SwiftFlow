"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ManageWorkspacesList } from "@/components/workspace/manage-workspaces-list"
import { ApiSettingsForm } from "@/components/settings/api-settings-form"
import { Workspace, WorkspaceRole } from "@/types/workspace"
import { WorkspaceSettings } from "@/types/settings"
import { TeamMembersPanel } from "@/components/settings/team-members-panel"
import { AccountSettingsSection } from "@/components/settings/account-settings-section"
import { TeamMemberRow, WorkspaceInviteRow } from "@/types/team"
import { DeveloperApiView } from "@/components/settings/developer-api-view"

interface SettingsViewProps {
    workspaces: (Workspace & { role: WorkspaceRole })[]
    settings: WorkspaceSettings | null
    activeWorkspace: { id: string; name: string } | null
    currentUserId: string
    activeWorkspaceRole: WorkspaceRole | null
    teamMembers: TeamMemberRow[]
    workspaceInvites: WorkspaceInviteRow[]
    inviteFeatureReady: boolean
    inviteFeatureMessage: string | null
    userEmail: string
}

export function SettingsView({
    workspaces,
    settings,
    activeWorkspace,
    currentUserId,
    activeWorkspaceRole,
    teamMembers,
    workspaceInvites,
    inviteFeatureReady,
    inviteFeatureMessage,
    userEmail,
}: SettingsViewProps) {
    const panelClass = "border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]"
    const tabListClass = "inline-flex h-auto min-w-max rounded-xl border border-white/10 bg-[#1b1d28] p-1"
    const tabTriggerClass = "shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none sm:px-4"

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                    Settings
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white/90">Workspace Settings</h2>
                <p className="text-sm text-white/55">Manage your workspace, AI provider, and collaboration settings.</p>
            </div>

            <Tabs defaultValue="workspaces" className="space-y-4">
                <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                    <TabsList className={tabListClass}>
                        <TabsTrigger value="workspaces" className={tabTriggerClass}>Workspaces</TabsTrigger>
                        <TabsTrigger value="api" className={tabTriggerClass}>AI Provider</TabsTrigger>
                        <TabsTrigger value="developer-api" className={tabTriggerClass}>Developer API</TabsTrigger>
                        <TabsTrigger value="members" className={tabTriggerClass}>Members</TabsTrigger>
                        <TabsTrigger value="account" className={tabTriggerClass}>Account</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="workspaces" className="space-y-4">
                    <Card className={panelClass}>
                        <CardHeader>
                            <CardTitle className="text-white/90">Your Workspaces</CardTitle>
                            <CardDescription className="text-white/50">
                                Manage the workspaces you belong to or create a new one.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ManageWorkspacesList workspaces={workspaces} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="api" className="space-y-4">
                    <ApiSettingsForm settings={settings} />
                </TabsContent>

                <TabsContent value="developer-api" className="space-y-4">
                    <DeveloperApiView />
                </TabsContent>

                <TabsContent value="members">
                    <Card className={panelClass}>
                        <CardHeader>
                            <CardTitle className="text-white/90">Team Members</CardTitle>
                            <CardDescription className="text-white/50">Invite your team to collaborate on this workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <TeamMembersPanel
                                activeWorkspace={activeWorkspace}
                                currentUserId={currentUserId}
                                activeWorkspaceRole={activeWorkspaceRole}
                                teamMembers={teamMembers}
                                workspaceInvites={workspaceInvites}
                                inviteFeatureReady={inviteFeatureReady}
                                inviteFeatureMessage={inviteFeatureMessage}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="account">
                    <AccountSettingsSection userEmail={userEmail} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
