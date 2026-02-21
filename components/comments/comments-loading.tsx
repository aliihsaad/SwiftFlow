"use client"

function DarkSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-md ${className ?? ''}`}
            style={{ background: 'rgba(255,255,255,0.05)' }}
        />
    )
}

export function CommentsLoadingSkeleton() {
    return (
        <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
                <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{ background: '#0e0d1c', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <div className="flex gap-4">
                        <DarkSkeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                                <DarkSkeleton className="h-3.5 w-24" />
                                <DarkSkeleton className="h-4 w-20 rounded-full" />
                                <DarkSkeleton className="h-3 w-16" />
                            </div>
                            <DarkSkeleton className="h-3.5 w-full" />
                            <DarkSkeleton className="h-3.5 w-3/4" />
                            <div className="flex items-center gap-2 pt-1">
                                <DarkSkeleton className="h-6 w-14 rounded-md" />
                                <DarkSkeleton className="h-6 w-16 rounded-md" />
                                <DarkSkeleton className="h-6 w-12 rounded-md" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
