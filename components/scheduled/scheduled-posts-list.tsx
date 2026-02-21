"use client"

import { useState } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { Pencil, CalendarDays, FileText, Trash2, Eye, Heart, MessageCircle, Share2, XCircle, Clock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

interface ScheduledPostsListProps {
    posts: any[]
    workspaceId: string
    status?: 'scheduled' | 'draft' | 'published' | 'failed'
}

const statusConfig = {
    scheduled: { label: 'Scheduled', color: '#818cf8', bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.3)',  glow: 'rgba(129,140,248,0.08)' },
    draft:     { label: 'Draft',     color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.25)',  glow: 'rgba(251,191,36,0.06)'  },
    published: { label: 'Published', color: '#34d399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.25)',  glow: 'rgba(52,211,153,0.07)'  },
    failed:    { label: 'Failed',    color: '#f87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.3)',  glow: 'rgba(248,113,113,0.08)' },
}

export function ScheduledPostsList({ posts, workspaceId, status = 'scheduled' }: ScheduledPostsListProps) {
    const [editingPost, setEditingPost] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [deletePostId, setDeletePostId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const { toast } = useToast()
    const router = useRouter()
    const supabase = createClient()

    const handleEdit = (post: any) => { setEditingPost(post); setIsModalOpen(true) }
    const handleModalClose = (open: boolean) => { setIsModalOpen(open); if (!open) setEditingPost(null) }
    const handleDeleteClick = (postId: string) => setDeletePostId(postId)

    const handleDeleteConfirm = async () => {
        if (!deletePostId) return
        setIsDeleting(true)
        try {
            const { error } = await supabase.from('posts').delete().eq('id', deletePostId)
            if (error) throw error
            toast({ title: "Post deleted", description: "The post has been permanently deleted." })
            router.refresh()
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to delete post", variant: "destructive" })
        } finally {
            setIsDeleting(false)
            setDeletePostId(null)
        }
    }

    /* ── Empty state ── */
    if (!posts || posts.length === 0) {
        const emptyMap = {
            draft:     { icon: FileText,     title: "No drafts yet",          description: "Create a new post and save it as a draft to come back to later." },
            scheduled: { icon: CalendarDays, title: "Nothing scheduled",      description: "Create a new post and pick a date to publish it automatically." },
            published: { icon: CalendarDays, title: "No published posts yet", description: "Once your scheduled posts go live, they'll appear here." },
            failed:    { icon: XCircle,      title: "No failed posts",        description: "All your publishing attempts have been successful — great work!" },
        }
        const { icon: Icon, title, description } = emptyMap[status]
        const cfg = statusConfig[status] ?? statusConfig.scheduled

        return (
            <div
                className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
                style={{
                    background: '#0e0d1c',
                    border: `1px dashed ${cfg.border}`,
                }}
            >
                <div
                    className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: cfg.bg, boxShadow: `0 0 32px ${cfg.glow}` }}
                >
                    <Icon className="h-7 w-7" style={{ color: cfg.color }} />
                </div>
                <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    {title}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {description}
                </p>
            </div>
        )
    }

    /* ── Post grid ── */
    return (
        <>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => {
                    const st = statusConfig[post.status as keyof typeof statusConfig] ?? statusConfig.draft
                    const platforms: string[] = Array.isArray(post.platforms)
                        ? post.platforms
                        : post.platforms?.selection || []

                    const dateStr = post.scheduled_for
                        ? new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : post.published_at
                            ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : null

                    const timeStr = post.scheduled_for
                        ? new Date(post.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : null

                    return (
                        <div
                            key={post.id}
                            className="group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-1"
                            style={{
                                background: '#0e0d1c',
                                border: `1px solid ${st.border}`,
                                boxShadow: `0 4px 24px ${st.glow}, 0 1px 0 rgba(255,255,255,0.04) inset`,
                            }}
                        >
                            {/* Media */}
                            {post.media_urls && post.media_urls.length > 0 && (
                                <div className="relative aspect-video w-full overflow-hidden bg-black">
                                    {post.media_urls[0].match(/\.(mp4|webm|ogg|mov)$/i) ? (
                                        <video src={post.media_urls[0]} className="w-full h-full object-cover opacity-90" playsInline muted preload="metadata" />
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={post.media_urls[0]} alt="Post media" className="w-full h-full object-cover opacity-90" />
                                    )}
                                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0e0d1c 0%, transparent 55%)' }} />

                                    {/* Status badge floated on image */}
                                    <div className="absolute left-3 top-3">
                                        <span
                                            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                                            style={{ background: st.bg, color: st.color, backdropFilter: 'blur(8px)' }}
                                        >
                                            {st.label}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Body */}
                            <div className="flex flex-1 flex-col gap-3 p-4">

                                {/* Status badge (when no media) + date */}
                                <div className="flex items-center justify-between gap-2">
                                    {(!post.media_urls || post.media_urls.length === 0) && (
                                        <span
                                            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                                            style={{ background: st.bg, color: st.color }}
                                        >
                                            {st.label}
                                        </span>
                                    )}
                                    {dateStr && (
                                        <div className="ml-auto flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.35)' }} suppressHydrationWarning>
                                            <Clock className="h-3 w-3 shrink-0" />
                                            <span className="text-[11px] font-medium">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <p className="line-clamp-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                    {post.content}
                                </p>

                                {/* Platform tags */}
                                {platforms.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {platforms.map((p: string) => (
                                            <span
                                                key={p}
                                                className="capitalize rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                                style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
                                            >
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Analytics for published posts */}
                                {status === 'published' && post.published_posts?.length > 0 && (
                                    <div className="mt-1 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        {post.published_posts.map((pp: any) => {
                                            const analytics = pp.post_analytics?.[0]
                                            if (!analytics) return null
                                            return (
                                                <div key={pp.id} className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                        {pp.platform} insights
                                                    </span>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { icon: Eye,           val: analytics.views,    label: 'Views'    },
                                                            { icon: Heart,         val: analytics.likes,    label: 'Likes'    },
                                                            { icon: MessageCircle, val: analytics.comments, label: 'Comments' },
                                                            { icon: Share2,        val: analytics.shares,   label: 'Shares'   },
                                                        ].filter(m => m.val > 0).map(({ icon: MIcon, val, label }) => (
                                                            <div key={label} className="flex items-center gap-1.5">
                                                                <MIcon className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
                                                                <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                                                    {val.toLocaleString()}
                                                                </span>
                                                                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Action buttons — always visible, bottom right */}
                            <div
                                className="flex items-center justify-end gap-2 px-4 py-3"
                                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                                <button
                                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
                                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
                                    onClick={() => handleEdit(post)}
                                >
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                </button>
                                <button
                                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
                                    style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                                    onClick={() => handleDeleteClick(post.id)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            <CreatePostModal
                open={isModalOpen}
                onOpenChange={handleModalClose}
                postToEdit={editingPost}
                workspaceId={workspaceId}
            />

            <AlertDialog open={!!deletePostId} onOpenChange={(open) => !open && setDeletePostId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Post</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this post? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
