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
    const panelClass = "border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]"
    const tabListClass = "h-auto w-full sm:w-fit rounded-xl border border-white/10 bg-[#1b1d28] p-1"
    const tabTriggerClass = "rounded-lg px-4 py-2.5 text-sm font-medium text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"

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
                <TabsList className={tabListClass}>
                    <TabsTrigger value="workspaces" className={tabTriggerClass}>Workspaces</TabsTrigger>
                    <TabsTrigger value="api" className={tabTriggerClass}>AI Provider</TabsTrigger>
                    <TabsTrigger value="members" className={tabTriggerClass}>Members</TabsTrigger>
                </TabsList>

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



                <TabsContent value="members">
                    <Card className={panelClass}>
                        <CardHeader>
                            <CardTitle className="text-white/90">Team Members</CardTitle>
                            <CardDescription className="text-white/50">Invite your team to collaborate on this workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border border-white/10 bg-white/5 py-8 text-center text-sm text-white/50">
                                Team management coming soon.
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
