"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ManageWorkspacesList } from "@/components/workspace/manage-workspaces-list"
import { ApiSettingsForm } from "@/components/settings/api-settings-form"
import { Workspace, WorkspaceRole } from "@/types/workspace"
import { WorkspaceSettings } from "@/types/settings"

interface SettingsViewProps {
    workspaces: (Workspace & { role: WorkspaceRole })[]
    settings: WorkspaceSettings | null
}

export function SettingsView({ workspaces, settings }: SettingsViewProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">Manage your workspace and social connections.</p>
            </div>

            <Tabs defaultValue="workspaces" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
                    <TabsTrigger value="api">AI Provider</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                </TabsList>

                <TabsContent value="workspaces" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Your Workspaces</CardTitle>
                            <CardDescription>
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



                <TabsContent value="members">
                    <Card>
                        <CardHeader>
                            <CardTitle>Team Members</CardTitle>
                            <CardDescription>Invite your team to collaborate on this workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-muted-foreground">
                                Team management coming soon.
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
