import { Skeleton } from "@/components/ui/skeleton";

export function ChatPageSkeleton() {
  return (
    <div className="grid h-screen grid-cols-[280px_1fr] gap-0 overflow-hidden">
      {/* Sidebar Skeleton */}
      <div className="flex flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border p-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 flex-1 rounded-md" />
        </div>
        
        {/* Server List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md p-2">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex flex-col">
        {/* Channel Header */}
        <div className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>

        {/* Messages Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-full max-w-md" />
                {i % 3 === 0 && <Skeleton className="h-4 w-3/4 max-w-lg" />}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-4">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
