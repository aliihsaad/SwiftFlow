"use client"

function Skeleton({ className }: { className: string }) {
    return <div className={`animate-pulse rounded-lg bg-white/[0.055] ${className}`} />
}

export function AnalyticsLoadingSkeleton() {
    return (
        <div className="space-y-4" aria-label="Loading saved analytics">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="rounded-[20px] border border-white/[0.07] bg-[#10131c] p-5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="mt-4 h-8 w-20" />
                        <Skeleton className="mt-5 h-3 w-32" />
                    </div>
                ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
                <div className="rounded-[22px] border border-white/[0.07] bg-[#10131c] p-5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="mt-5 h-[240px] w-full" />
                </div>
                <div className="rounded-[22px] border border-white/[0.07] bg-[#10131c] p-5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-5 h-16 w-full" />
                    <Skeleton className="mt-3 h-16 w-full" />
                    <Skeleton className="mt-3 h-16 w-full" />
                </div>
            </div>
        </div>
    )
}
