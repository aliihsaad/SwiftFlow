import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { createClient } from "@/utils/supabase/server"
import { Workspace } from "@/types/workspace"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const activeWorkspace = await getActiveWorkspace()

    const { data: members } = await supabase
        .from('workspace_members')
        .select(`
            workspace_id,
            workspaces (
                id, name, slug, owner_id, created_at
            )
        `)
        .eq('user_id', user.id)

    const workspaceList = (members?.map(m => {
        const ws = m.workspaces
        return Array.isArray(ws) ? ws[0] : ws
    }).filter(Boolean) || []) as Workspace[]

    const userInitial = user.email?.charAt(0).toUpperCase() || 'U'

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: '#070710' }}>
            {/* Sidebar — desktop only */}
            <div className="hidden sm:flex h-full">
                <Sidebar
                    workspaces={workspaceList}
                    activeWorkspace={activeWorkspace}
                />
            </div>

            <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                {/* Header */}
                <header
                    className="flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6"
                    style={{
                        background: 'rgba(7,7,16,0.9)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(255,255,255,0.055)',
                    }}
                >
                    {/* Mobile hamburger — hidden on desktop */}
                    <div className="sm:hidden">
                        <MobileNav activeWorkspace={activeWorkspace} workspaces={workspaceList} />
                    </div>

                    {/* Workspace indicator */}
                    <div className="flex items-center gap-2.5">
                        <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                        />
                        <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            {activeWorkspace?.name || 'Dashboard'}
                        </span>
                    </div>

                    {/* Right: user avatar */}
                    <div className="ml-auto flex items-center gap-3">
                        <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 select-none cursor-default"
                            title={user?.email || ''}
                            style={{
                                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                boxShadow: '0 0 0 2px rgba(139,92,246,0.2), 0 2px 8px rgba(0,0,0,0.4)',
                            }}
                        >
                            {userInitial}
                        </div>
                    </div>
                </header>

                {/* Main content */}
                <main
                    className="flex-1 overflow-y-auto p-3 sm:p-6"
                    style={{ background: '#080813' }}
                >
                    {children}
                </main>

                {/* Footer */}
                <footer
                    className="flex h-10 shrink-0 items-center justify-between px-6"
                    style={{
                        borderTop: '1px solid rgba(255,255,255,0.045)',
                        background: 'rgba(7,7,16,0.8)',
                        color: 'rgba(255,255,255,0.2)',
                        fontSize: '11px',
                    }}
                >
                    <span>© 2026 SwiftFlow</span>
                    <nav className="flex items-center gap-4">
                        {[
                            { href: '/privacy', label: 'Privacy' },
                            { href: '/terms', label: 'Terms' },
                            { href: '/data-deletion', label: 'Data Deletion' },
                            { href: 'mailto:info@swiftdigital-s.com', label: 'Support' },
                        ].map(({ href, label }) => (
                            <a
                                key={href}
                                href={href}
                                className="text-white/20 hover:text-white/50 transition-colors duration-150"
                            >
                                {label}
                            </a>
                        ))}
                    </nav>
                </footer>
            </div>
        </div>
    )
}
