"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FeatureFlag } from "@/lib/types";
import {
    FEATURE_FLAGS,
    getFeatureFlagDescription,
    type FeatureFlagKey,
} from "@/lib/feature-flags";

import { getFeatureFlagsAction, updateFeatureFlagAction } from "./actions";

interface FeatureFlagsProps {
    userId: string;
}

export function FeatureFlags({ userId }: FeatureFlagsProps) {
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    const loadFlags = useCallback(async () => {
        try {
            const result = await getFeatureFlagsAction(userId);
            setFlags(result);
        } catch (error) {
            console.error("Failed to load feature flags:", error);
            toast.error("Failed to load feature flags");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void loadFlags();
    }, [loadFlags]);

    const handleToggle = async (key: FeatureFlagKey, enabled: boolean) => {
        setUpdating(key);
        try {
            const result = await updateFeatureFlagAction(userId, key, enabled);

            if (result.success) {
                setFlags((prev) =>
                    prev.map((flag) =>
                        flag.key === key ? { ...flag, enabled } : flag,
                    ),
                );
                toast.success(
                    `Feature flag ${enabled ? "enabled" : "disabled"}`,
                );
            } else {
                toast.error(result.error || "Failed to update feature flag");
            }
        } catch (error) {
            console.error("Failed to update feature flag:", error);
            toast.error("Failed to update feature flag");
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Feature Flags</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Loading feature flags...
                </p>
            </section>
        );
    }

    // Get all known flag keys and their descriptions
    const flagDefinitions = Object.entries(FEATURE_FLAGS).map(
        ([name, key]) => ({
            name: name
                .split("_")
                .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                .join(" "),
            key,
        }),
    );

    return (
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Feature Flags</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
                Control which features are enabled for your Firepit instance.
            </p>

            <div className="space-y-4">
                {flagDefinitions.map(({ name, key }) => {
                    const flag = flags.find((f) => f.key === key);
                    const isEnabled = flag?.enabled ?? false;
                    const isUpdating = updating === key;
                    const description =
                        flag?.description || getFeatureFlagDescription(key);

                    return (
                        <div
                            key={key}
                            className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 p-4"
                        >
                            <div className="flex-1">
                                <Label
                                    htmlFor={`flag-${key}`}
                                    className="text-sm font-medium cursor-pointer"
                                >
                                    {name}
                                </Label>
                                {description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {description}
                                    </p>
                                )}
                            </div>
                            <Switch
                                id={`flag-${key}`}
                                checked={isEnabled}
                                onCheckedChange={(checked) =>
                                    handleToggle(key, checked)
                                }
                                disabled={isUpdating}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
