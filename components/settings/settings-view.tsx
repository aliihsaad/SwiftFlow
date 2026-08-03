"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
    BrainCircuit,
    Braces,
    Building2,
    ChevronRight,
    Fingerprint,
    ShieldCheck,
    Sparkles,
    UserRoundCog,
    UsersRound,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type SettingsTabValue = "workspaces" | "api" | "developer-api" | "members" | "account"

type SettingsTabMeta = {
    value: SettingsTabValue
    label: string
    eyebrow: string
    title: string
    description: string
    icon: LucideIcon
    iconClass: string
    iconSurfaceClass: string
}

const settingsTabs: SettingsTabMeta[] = [
    {
        value: "workspaces",
        label: "Workspaces",
        eyebrow: "Organization",
        title: "Shape the spaces your team works in.",
        description: "Create, rename, leave, or retire workspaces without losing sight of who owns each environment.",
        icon: Building2,
        iconClass: "text-cyan-100",
        iconSurfaceClass: "border-cyan-300/20 bg-cyan-300/10",
    },
    {
        value: "api",
        label: "AI Provider",
        eyebrow: "Automation intelligence",
        title: "Choose the intelligence behind every AI reply.",
        description: "Keep provider credentials encrypted, validate them before use, and control the models available to automation nodes.",
        icon: BrainCircuit,
        iconClass: "text-violet-100",
        iconSurfaceClass: "border-violet-300/20 bg-violet-300/10",
    },
    {
        value: "developer-api",
        label: "Developer API",
        eyebrow: "Programmable control",
        title: "Give trusted tools narrow, auditable access.",
        description: "Create scoped keys for engagement automations, analytics, and workspace configuration—never content publishing.",
        icon: Braces,
        iconClass: "text-amber-100",
        iconSurfaceClass: "border-amber-300/20 bg-amber-300/10",
    },
    {
        value: "members",
        label: "Members",
        eyebrow: "Team access",
        title: "Put the right people in the right roles.",
        description: "Invite collaborators, review pending access, and keep workspace permissions easy to understand.",
        icon: UsersRound,
        iconClass: "text-emerald-100",
        iconSurfaceClass: "border-emerald-300/20 bg-emerald-300/10",
    },
    {
        value: "account",
        label: "Account",
        eyebrow: "Personal security",
        title: "Protect the account behind your workspace.",
        description: "Manage sign-in credentials and sensitive account actions from one deliberately separated security area.",
        icon: UserRoundCog,
        iconClass: "text-rose-100",
        iconSurfaceClass: "border-rose-300/20 bg-rose-300/10",
    },
]

function titleCaseRole(role: WorkspaceRole | null) {
    if (!role) return "Member"
    return role.charAt(0).toUpperCase() + role.slice(1)
}

function SettingsSectionIntro({ tab }: { tab: SettingsTabMeta }) {
    const Icon = tab.icon

    return (
        <div className="border-b border-white/8 px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${tab.iconSurfaceClass}`}>
                        <Icon className={`h-5 w-5 ${tab.iconClass}`} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">{tab.eyebrow}</p>
                        <h2 className="mt-1 max-w-3xl text-xl font-semibold tracking-[-0.025em] text-white sm:text-2xl">{tab.title}</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">{tab.description}</p>
                    </div>
                </div>
                <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-medium text-emerald-100/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" />
                    Live configuration
                </div>
            </div>
        </div>
    )
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
    const [activeTab, setActiveTab] = useState<SettingsTabValue>("workspaces")
    const activeTabMeta = settingsTabs.find((tab) => tab.value === activeTab) ?? settingsTabs[0]

    return (
        <div className="space-y-6 pb-10">
            <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#11131d] shadow-[0_24px_90px_rgba(0,0,0,0.34)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_88%_4%,rgba(168,85,247,0.17),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_46%)]" aria-hidden="true" />
                <div className="relative grid gap-7 p-6 sm:p-8 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-end">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Workspace control room
                        </div>
                        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">Configure SwiftFlow around your team.</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
                            One secure place for workspace structure, automation intelligence, API access, collaboration, and account protection.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                        {[
                            { label: "Workspace", value: activeWorkspace?.name || "Not selected", icon: Building2 },
                            { label: "Your access", value: titleCaseRole(activeWorkspaceRole), icon: ShieldCheck },
                            { label: "Members", value: String(teamMembers.length), icon: UsersRound },
                            { label: "Secrets", value: "Encrypted", icon: Fingerprint },
                        ].map((metric) => {
                            const MetricIcon = metric.icon
                            return (
                                <div key={metric.label} className="min-w-0 rounded-2xl border border-white/8 bg-black/20 px-3.5 py-3 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 text-white/35">
                                        <MetricIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span className="text-[9px] font-semibold uppercase tracking-[0.18em]">{metric.label}</span>
                                    </div>
                                    <p className="mt-2 truncate text-sm font-medium text-white/85" title={metric.value}>{metric.value}</p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTabValue)} className="w-full">
                <div className="grid items-start gap-5 xl:grid-cols-[286px_minmax(0,1fr)]">
                    <aside className="rounded-[26px] border border-white/9 bg-[#11131c]/95 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.25)] xl:sticky xl:top-5">
                        <div className="px-3 pb-3 pt-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">Settings areas</p>
                            <p className="mt-1 text-xs leading-5 text-white/45">Changes apply to the active workspace unless marked personal.</p>
                        </div>
                        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 xl:grid-cols-1">
                            {settingsTabs.map((tab) => {
                                const Icon = tab.icon
                                return (
                                    <TabsTrigger
                                        key={tab.value}
                                        value={tab.value}
                                        className="group h-auto min-w-0 justify-start gap-3 whitespace-normal rounded-2xl border border-transparent px-3 py-3 text-left text-white/55 transition-colors hover:border-white/8 hover:bg-white/[0.035] hover:text-white/80 data-[state=active]:border-white/10 data-[state=active]:bg-white/[0.075] data-[state=active]:text-white data-[state=active]:shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                                    >
                                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tab.iconSurfaceClass}`}>
                                            <Icon className={`h-4 w-4 ${tab.iconClass}`} aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{tab.label}</span>
                                            <span className="mt-0.5 hidden truncate text-[11px] font-normal text-white/35 sm:block">{tab.eyebrow}</span>
                                        </span>
                                        <ChevronRight className="hidden h-4 w-4 shrink-0 text-white/20 transition-transform group-data-[state=active]:translate-x-0.5 group-data-[state=active]:text-white/55 xl:block" aria-hidden="true" />
                                    </TabsTrigger>
                                )
                            })}
                        </TabsList>
                        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                                <ShieldCheck className="h-4 w-4 text-emerald-200/70" aria-hidden="true" />
                                Security boundary
                            </div>
                            <p className="mt-1.5 text-[11px] leading-5 text-white/38">Provider secrets remain server-side and are never returned to the browser after saving.</p>
                        </div>
                    </aside>

                    <section className="min-w-0 overflow-hidden rounded-[28px] border border-white/9 bg-[#11131c]/95 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                        <SettingsSectionIntro tab={activeTabMeta} />
                        <div className="p-4 sm:p-6">
                            <TabsContent value="workspaces" className="m-0 focus-visible:outline-none">
                                <ManageWorkspacesList workspaces={workspaces} />
                            </TabsContent>
                            <TabsContent value="api" className="m-0 focus-visible:outline-none">
                                <ApiSettingsForm settings={settings} />
                            </TabsContent>
                            <TabsContent value="developer-api" className="m-0 focus-visible:outline-none">
                                <DeveloperApiView />
                            </TabsContent>
                            <TabsContent value="members" className="m-0 focus-visible:outline-none">
                                <TeamMembersPanel
                                    activeWorkspace={activeWorkspace}
                                    currentUserId={currentUserId}
                                    activeWorkspaceRole={activeWorkspaceRole}
                                    teamMembers={teamMembers}
                                    workspaceInvites={workspaceInvites}
                                    inviteFeatureReady={inviteFeatureReady}
                                    inviteFeatureMessage={inviteFeatureMessage}
                                />
                            </TabsContent>
                            <TabsContent value="account" className="m-0 focus-visible:outline-none">
                                <AccountSettingsSection userEmail={userEmail} />
                            </TabsContent>
                        </div>
                    </section>
                </div>
            </Tabs>
        </div>
    )
}
