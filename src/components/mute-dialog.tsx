"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff, Volume2, VolumeX, AtSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
    MuteDuration,
    NotificationLevel,
    NotificationOverride,
} from "@/lib/types";

type MuteTargetType = "server" | "channel" | "conversation";

interface MuteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetType: MuteTargetType;
    targetId: string;
    targetName: string;
    initialOverride?: NotificationOverride;
    onMuteComplete?: () => void;
}

interface DurationOption {
    value: MuteDuration;
    label: string;
}

const DURATION_OPTIONS: DurationOption[] = [
    { value: "15m", label: "15 minutes" },
    { value: "1h", label: "1 hour" },
    { value: "8h", label: "8 hours" },
    { value: "24h", label: "24 hours" },
    { value: "forever", label: "Until I unmute" },
];

interface NotificationLevelOption {
    value: NotificationLevel;
    label: string;
    description: string;
    icon: React.ReactNode;
}

const LEVEL_OPTIONS: NotificationLevelOption[] = [
    {
        value: "nothing",
        label: "Mute all",
        description: "No notifications at all",
        icon: <VolumeX className="h-4 w-4" />,
    },
    {
        value: "mentions",
        label: "Only @mentions",
        description: "Only notify when you're mentioned",
        icon: <AtSign className="h-4 w-4" />,
    },
    {
        value: "all",
        label: "All messages",
        description: "Get notified for every message",
        icon: <Volume2 className="h-4 w-4" />,
    },
];

function getApiEndpoint(targetType: MuteTargetType, targetId: string): string {
    switch (targetType) {
        case "server":
            return `/api/servers/${targetId}/mute`;
        case "channel":
            return `/api/channels/${targetId}/mute`;
        case "conversation":
            return `/api/conversations/${targetId}/mute`;
    }
}

function getTargetTypeLabel(targetType: MuteTargetType): string {
    switch (targetType) {
        case "server":
            return "server";
        case "channel":
            return "channel";
        case "conversation":
            return "conversation";
    }
}

function getPrecedenceHint(targetType: MuteTargetType): string {
    switch (targetType) {
        case "server":
            return "Server overrides beat your global default, but a specific channel override can still win inside this server.";
        case "channel":
            return "Channel overrides are the most specific setting in servers, so they beat both server and global notification defaults.";
        case "conversation":
            return "Direct message overrides beat your global default for this conversation only.";
    }
}

function getPresetDuration(
    override: NotificationOverride | undefined,
): MuteDuration {
    if (!override?.mutedUntil) {
        return "forever";
    }

    const remainingMs = new Date(override.mutedUntil).getTime() - Date.now();
    if (remainingMs <= 15 * 60 * 1000) {
        return "15m";
    }
    if (remainingMs <= 60 * 60 * 1000) {
        return "1h";
    }
    if (remainingMs <= 8 * 60 * 60 * 1000) {
        return "8h";
    }
    if (remainingMs <= 24 * 60 * 60 * 1000) {
        return "24h";
    }

    return "forever";
}

export function MuteDialog({
    open,
    onOpenChange,
    targetType,
    targetId,
    targetName,
    initialOverride,
    onMuteComplete,
}: MuteDialogProps) {
    const [selectedDuration, setSelectedDuration] =
        useState<MuteDuration>("forever");
    const [selectedLevel, setSelectedLevel] =
        useState<NotificationLevel>("nothing");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setSelectedLevel(initialOverride?.level ?? "nothing");
        setSelectedDuration(getPresetDuration(initialOverride));
    }, [initialOverride, open]);

    const handleMute = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch(getApiEndpoint(targetType, targetId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    muted: true,
                    duration: selectedDuration,
                    level: selectedLevel,
                }),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { error?: string };
                throw new Error(errorData.error ?? "Failed to mute");
            }

            toast.success(`Muted ${targetName}`);
            onOpenChange(false);
            onMuteComplete?.();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to mute",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnmute = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch(getApiEndpoint(targetType, targetId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    muted: false,
                }),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { error?: string };
                throw new Error(errorData.error ?? "Failed to unmute");
            }

            toast.success(`Unmuted ${targetName}`);
            onOpenChange(false);
            onMuteComplete?.();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to unmute",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader className="gap-2">
                    <DialogTitle className="flex items-center gap-2">
                        <BellOff className="h-5 w-5" />
                        Mute {getTargetTypeLabel(targetType)}
                    </DialogTitle>
                    <DialogDescription>
                        Choose how long to mute{" "}
                        <span className="font-medium text-foreground">
                            {targetName}
                        </span>{" "}
                        and what notifications to suppress.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 py-2">
                    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">
                            How this override behaves
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">
                            {getPrecedenceHint(targetType)}
                        </p>
                    </div>

                    {/* Duration Selection */}
                    <div className="space-y-2">
                        <Label>Mute for</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {DURATION_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                        setSelectedDuration(option.value)
                                    }
                                    className={`flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted ${
                                        selectedDuration === option.value
                                            ? "border-primary bg-primary/5"
                                            : "border-border"
                                    }`}
                                >
                                    <div
                                        className={`h-3.5 w-3.5 rounded-full border-2 ${
                                            selectedDuration === option.value
                                                ? "border-primary bg-primary"
                                                : "border-muted-foreground"
                                        }`}
                                    />
                                    <span className="text-sm font-medium">
                                        {option.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notification Level Selection */}
                    <div className="space-y-2">
                        <Label>Notification level</Label>
                        <div className="grid gap-2">
                            {LEVEL_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                        setSelectedLevel(option.value)
                                    }
                                    className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                                        selectedLevel === option.value
                                            ? "border-primary bg-primary/5"
                                            : "border-border"
                                    }`}
                                >
                                    <div
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                            selectedLevel === option.value
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted"
                                        }`}
                                    >
                                        {option.icon}
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-sm font-medium leading-none">
                                            {option.label}
                                        </span>
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {option.description}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
                    <Button
                        variant="outline"
                        onClick={handleUnmute}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto"
                    >
                        Unmute
                    </Button>
                    <Button
                        onClick={handleMute}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto"
                    >
                        {isSubmitting ? "Saving..." : "Mute"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
