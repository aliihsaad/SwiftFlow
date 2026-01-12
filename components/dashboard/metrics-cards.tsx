import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Flame, Calendar, CheckCircle2 } from "lucide-react"

interface MetricsProps {
    streak: number
    scheduledCount: number
    postedCount: number
}

export function MetricsCards({ streak, scheduledCount, postedCount }: MetricsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 border-orange-200 dark:border-orange-900">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        Current Streak
                    </CardTitle>
                    <Flame className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{streak} Days</div>
                    <p className="text-xs text-orange-600/60 dark:text-orange-400/60">
                        Goal: 10 days 🔥
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-900">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Scheduled
                    </CardTitle>
                    <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{scheduledCount} Posts</div>
                    <p className="text-xs text-blue-600/60 dark:text-blue-400/60">
                        Next post soon
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-900">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                        Posted
                    </CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">{postedCount} Posts</div>
                    <p className="text-xs text-green-600/60 dark:text-green-400/60">
                        Total published
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
