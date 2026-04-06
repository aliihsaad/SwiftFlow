import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileEdit, Send, Sparkles, CalendarClock, Ban } from "lucide-react"

export type RecentAction = {
    id: string
    type: 'draft' | 'published' | 'scheduled' | 'ai_generated' | 'failed'
    description: string
    timestamp: string
}

const getActionIcon = (type: RecentAction['type']) => {
    switch (type) {
        case 'draft':
            return <FileEdit className="h-4 w-4 text-amber-500" />
        case 'published':
            return <Send className="h-4 w-4 text-green-500" />
        case 'scheduled':
            return <CalendarClock className="h-4 w-4 text-blue-500" />
        case 'ai_generated':
            return <Sparkles className="h-4 w-4 text-purple-500" />
        case 'failed':
            return <Ban className="h-4 w-4 text-red-500" />
        default:
            return <Sparkles className="h-4 w-4 text-gray-500" />
    }
}

const getActionColor = (type: RecentAction['type']) => {
    switch (type) {
        case 'draft':
            return "bg-amber-100 dark:bg-amber-900/20"
        case 'published':
            return "bg-green-100 dark:bg-green-900/20"
        case 'scheduled':
            return "bg-blue-100 dark:bg-blue-900/20"
        case 'ai_generated':
            return "bg-purple-100 dark:bg-purple-900/20"
        case 'failed':
            return "bg-red-100 dark:bg-red-900/20"
        default:
            return "bg-gray-100 dark:bg-gray-800"
    }
}

interface RecentActivityProps {
    activities: RecentAction[]
}

export function RecentActivity({ activities }: RecentActivityProps) {
    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-4 pb-2">
                <h3 className="font-semibold leading-none tracking-tight">Recent Activity</h3>
                <p className="text-sm text-muted-foreground">
                    Latest actions in your workspace
                </p>
            </div>
            <div className="p-4 pt-0">
                <ScrollArea className="h-[180px] md:h-[200px] pr-4">
                    <div className="space-y-4">
                        {activities.length === 0 ? (
                            <div className="text-sm text-gray-500 text-center py-4">No recent activity</div>
                        ) : (
                            activities.map((activity, index) => (
                                <div key={activity.id} className="flex gap-4 relative">
                                    {/* Timeline line */}
                                    {index !== activities.length - 1 && (
                                        <div className="absolute left-[19px] top-10 bottom-[-24px] w-[2px] bg-muted" />
                                    )}

                                    <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${getActionColor(activity.type)}`}>
                                        {getActionIcon(activity.type)}
                                    </div>
                                    <div className="flex flex-col gap-1 pb-1">
                                        <p className="text-sm font-medium leading-none">
                                            {activity.description}
                                        </p>
                                        <span className="text-xs text-muted-foreground">
                                            {activity.timestamp}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}
