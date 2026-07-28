"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

type RecentPostAnalytics = {
    views?: number
    likes?: number
    comments?: number
    shares?: number
    engagement_rate?: number
}

type RecentAnalyticsPost = {
    id: string
    platform: string
    published_at: string
    post_analytics?: RecentPostAnalytics[] | null
}

interface RecentAnalyticsProps {
    posts: RecentAnalyticsPost[]
}

export function RecentAnalytics({ posts }: RecentAnalyticsProps) {
    if (!posts || posts.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        No analytics data available yet. Publish some posts to see their performance!
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Post Performance</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Platform</TableHead>
                            <TableHead>Published</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                            <TableHead className="text-right">Likes</TableHead>
                            <TableHead className="text-right">Comments</TableHead>
                            <TableHead className="text-right">Shares</TableHead>
                            <TableHead className="text-right">Engagement Rate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {posts.map((post) => {
                            const analytics = post.post_analytics?.[0]
                            return (
                                <TableRow key={post.id}>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                post.platform === 'instagram'
                                                    ? 'border-pink-500 text-pink-700 dark:text-pink-400'
                                                    : 'border-blue-500 text-blue-700 dark:text-blue-400'
                                            }
                                        >
                                            {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                                        {formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {analytics?.views?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {analytics?.likes?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {analytics?.comments?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {analytics?.shares?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {analytics?.engagement_rate ? (
                                            <Badge
                                                className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                                            >
                                                {analytics.engagement_rate}%
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
