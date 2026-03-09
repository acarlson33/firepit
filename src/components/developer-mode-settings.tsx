"use client";

import { BookOpenText } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";

import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function DeveloperModeSettings() {
    const { userData } = useAuth();
    const userId = userData?.userId ?? null;
    const { developerMode, isLoaded, setDeveloperMode } =
        useDeveloperMode(userId);

    return (
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <BookOpenText className="h-4 w-4 text-primary" />
                        <Label
                            className="text-base font-semibold text-foreground"
                            htmlFor="developer-mode"
                        >
                            Show Docs in navigation
                        </Label>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Keep the Docs link visible in the top navigation, or
                        hide it to reduce clutter if you rarely need product or
                        API documentation.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {developerMode
                            ? "The Docs link is currently visible in the main navigation."
                            : "The Docs link is currently hidden from the main navigation."}
                    </p>
                </div>

                <Switch
                    checked={developerMode}
                    disabled={!isLoaded || !userId}
                    id="developer-mode"
                    onCheckedChange={setDeveloperMode}
                />
            </div>
        </div>
    );
}
