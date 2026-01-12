"use client"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Calendar, Instagram, Facebook } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface PostCardProps {
    status: 'scheduled' | 'posted' | 'failed'
    platform: 'instagram' | 'facebook' | 'both'
    content: string
    date: string
    image?: string
}

export function PostCard({ status, platform, content, date, image }: PostCardProps) {
    const statusColor = {
        scheduled: "bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-500/20 dark:text-blue-400",
        posted: "bg-green-100 text-green-700 hover:bg-green-100/80 dark:bg-green-500/20 dark:text-green-400",
        failed: "bg-red-100 text-red-700 hover:bg-red-100/80 dark:bg-red-500/20 dark:text-red-400",
    }

    return (
        <Card className="overflow-hidden">
            <div className="relative aspect-square bg-muted">
                {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="Post" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground bg-secondary">
                        No Preview
                    </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                    {platform === 'instagram' || platform === 'both' ? <div className="p-1.5 bg-background/90 rounded-full shadow-sm"><Instagram className="h-3 w-3 text-pink-600" /></div> : null}
                    {platform === 'facebook' || platform === 'both' ? <div className="p-1.5 bg-background/90 rounded-full shadow-sm"><Facebook className="h-3 w-3 text-blue-600" /></div> : null}
                </div>
            </div>
            <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                    <Badge variant="secondary" className={statusColor[status]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Badge>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-6 w-6 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem>Unschedule</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <p className="text-sm line-clamp-2 text-muted-foreground">{content}</p>
                <div className="flex items-center text-xs text-muted-foreground gap-1">
                    <Calendar className="h-3 w-3" />
                    {date}
                </div>
            </CardContent>
        </Card>
    )
}
