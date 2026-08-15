"use client";

import { Loader2 } from "lucide-react";
import { useOffline } from "next/offline";

export function ConnectivityLoader() {
    const isOffline = useOffline();

    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">
                    {isOffline
                        ? "Waiting for connection..."
                        : "Loading firepit..."}
                </p>
            </div>
        </div>
    );
}
