"use client";

import { Badge } from "@/components/ui/badge";
import { useFriends } from "@/hooks/useFriends";

export function PendingFriendRequestsBadge() {
    const { incoming, loading } = useFriends();

    if (loading || incoming.length === 0) {
        return null;
    }

    return (
        <Badge
            className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
            variant="destructive"
        >
            {incoming.length} pending
        </Badge>
    );
}
