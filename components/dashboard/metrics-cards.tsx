import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, CheckCircle2, FileEdit, TrendingUp, TrendingDown, HelpCircle, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface MetricsProps {
    draftCount: number
    scheduledCount: number
    postedCount: number
    workspaceId: string
}

// Simple Sparkline Component
function Sparkline({ data, color }: { data: number[], color: string }) {
    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100
        const y = 100 - ((d - min) / range) * 100
        return `${x},${y}`
    }).join(' ')

    return (
        <div className="h-8 w-24">
            <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className={color}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    )
}

export function MetricsCards({ draftCount, scheduledCount, postedCount, workspaceId }: MetricsProps) {
    // Mock trend strings and data for visual enhancement
    const draftTrend = { value: 12, isUp: true }
    const scheduledTrend = { value: 5, isUp: true }
    const postedTrend = { value: 2, isUp: false } // vs yesterday

    const isWorkspaceEmpty = (draftCount + scheduledCount + postedCount) === 0

    return (
        <TooltipProvider>
            <div className="grid gap-6 md:grid-cols-3">
                <Link href="/dashboard/scheduled?tab=drafts">
                    <Card className="relative overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md hover:scale-[1.02] bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-900 group cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                Drafts
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-3.5 w-3.5 text-amber-600/50" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Posts awaiting completion or scheduling</p>
                                    </TooltipContent>
                                </Tooltip>
                            </CardTitle>
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full group-hover:bg-amber-200 dark:group-hover:bg-amber-800/40 transition-colors">
                                <FileEdit className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">{draftCount}</div>
                                    {/* Trend simplified */}
                                    <div className="flex items-center text-xs font-medium text-amber-600/80 dark:text-amber-400/80 mt-1">
                                        {draftTrend.isUp ? <TrendingUp className="mr-1 h-3 w-3 text-green-600" /> : <TrendingDown className="mr-1 h-3 w-3 text-red-600" />}
                                        <span className={draftTrend.isUp ? "text-green-600" : "text-red-600"}>
                                            {draftTrend.value}%
                                        </span>
                                    </div>
                                </div>
                                <Sparkline data={[2, 5, 3, 7, 4, 8, 6]} color="text-amber-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <div className="group">
                    <Card className="relative overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md hover:scale-[1.02] bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-900">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                Scheduled
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-3.5 w-3.5 text-blue-600/50" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Posts approved and waiting to publish</p>
                                    </TooltipContent>
                                </Tooltip>
                            </CardTitle>
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isWorkspaceEmpty ? (
                                <div className="flex items-center justify-center p-2">
                                    <CreatePostTrigger workspaceId={workspaceId}>
                                        <Button variant="outline" size="sm" className="w-full text-xs h-8 border-dashed border-blue-300 dark:border-blue-700 bg-transparent hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                            <Plus className="h-3 w-3 mr-1" /> Create First Post
                                        </Button>
                                    </CreatePostTrigger>
                                </div>
                            ) : (
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{scheduledCount}</div>
                                        <div className="flex items-center text-xs font-medium text-blue-600/80 dark:text-blue-400/80 mt-1">
                                            {scheduledTrend.isUp ? <TrendingUp className="mr-1 h-3 w-3 text-green-600" /> : <TrendingDown className="mr-1 h-3 w-3 text-red-600" />}
                                            <span className={scheduledTrend.isUp ? "text-green-600" : "text-red-600"}>
                                                {scheduledTrend.value}%
                                            </span>
                                        </div>
                                    </div>
                                    <Sparkline data={[4, 2, 5, 3, 6, 4, 7]} color="text-blue-500/50" />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="group">
                    <Card className="relative overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md hover:scale-[1.02] bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-900">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
                                Posted
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-3.5 w-3.5 text-green-600/50" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Total posts published to social platforms</p>
                                    </TooltipContent>
                                </Tooltip>
                            </CardTitle>
                            <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-full group-hover:bg-green-200 dark:group-hover:bg-green-800/40 transition-colors">
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isWorkspaceEmpty ? (
                                <div className="flex items-center justify-center p-2">
                                    <CreatePostTrigger workspaceId={workspaceId}>
                                        <Button variant="outline" size="sm" className="w-full text-xs h-8 border-dashed border-green-300 dark:border-green-700 bg-transparent hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-300">
                                            <Plus className="h-3 w-3 mr-1" /> Create First Post
                                        </Button>
                                    </CreatePostTrigger>
                                </div>
                            ) : (
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-3xl font-bold text-green-700 dark:text-green-300">{postedCount}</div>
                                        <div className="flex items-center text-xs font-medium text-green-600/80 dark:text-green-400/80 mt-1">
                                            {postedTrend.isUp ? <TrendingUp className="mr-1 h-3 w-3 text-green-600" /> : <TrendingDown className="mr-1 h-3 w-3 text-red-600" />}
                                            <span className={postedTrend.isUp ? "text-green-600" : "text-red-600"}>
                                                {postedTrend.value}
                                            </span>
                                        </div>
                                    </div>
                                    <Sparkline data={[1, 3, 2, 4, 5, 8, 9]} color="text-green-500/50" />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </TooltipProvider>
    )
}
