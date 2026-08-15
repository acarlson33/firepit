"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";

export function OfflineBanner() {
    const isOffline = useOffline();

    if (!isOffline) {
        return null;
    }

    return (
        <div
            className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
            role="status"
        >
            <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-xl shadow-amber-500/20 backdrop-blur">
                <WifiOff className="h-4 w-4" />
                Offline. Pending requests will retry when you&apos;re back
                online.
            </div>
        </div>
    );
}
