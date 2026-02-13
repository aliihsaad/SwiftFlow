"use client"

import { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AutomationCardProps {
    icon: LucideIcon
    title: string
    description: string
    onClick: () => void
    badge?: string
    disabled?: boolean
}

export function AutomationCard({
    icon: Icon,
    title,
    description,
    onClick,
    badge,
    disabled = false
}: AutomationCardProps) {
    return (
        <Card
            className={cn(
                "cursor-pointer transition-all hover:shadow-md hover:border-primary/50 relative overflow-hidden group",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={disabled ? undefined : onClick}
        >
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-base">{title}</h3>
                            {badge && (
                                <Badge variant="secondary" className="text-xs">
                                    {badge}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Hover indicator */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </CardContent>
        </Card>
    )
}
