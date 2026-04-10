"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";

import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function TelemetrySettings() {
    const [isMounted, setIsMounted] = useState(false);
    const { userData } = useAuth();
    const userId = userData?.userId ?? null;
    const {
        isLoaded,
        isSaving,
        navigationPreferences,
        updateNavigationPreferences,
    } = useDeveloperMode(userId);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const isDisabled = !isMounted || !isLoaded || !userId || isSaving;

    return (
        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <Label
                            className="text-base font-semibold text-foreground"
                            htmlFor="telemetry-enabled"
                        >
                            Telemetry and analytics
                        </Label>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Enable anonymous usage and reliability telemetry for
                        your account. Turning this off disables client-side
                        PostHog tracking for your signed-in session.
                    </p>
                </div>

                <Switch
                    checked={navigationPreferences.telemetryEnabled}
                    disabled={isDisabled}
                    id="telemetry-enabled"
                    onCheckedChange={(checked) =>
                        updateNavigationPreferences({
                            telemetryEnabled: checked,
                        })
                    }
                />
            </div>
        </div>
    );
}
