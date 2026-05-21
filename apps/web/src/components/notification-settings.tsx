"use client";

import {
    startTransition,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
} from "react";
import { toast } from "sonner";
import {
    Bell,
    BellOff,
    Volume2,
    VolumeX,
    Moon,
    Clock,
    AtSign,
    Users,
    Hash,
    MessageSquare,
    Shield,
    Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MuteDialog } from "@/components/mute-dialog";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type {
    DirectMessagePrivacy,
    NotificationLevel,
    NotificationOverride,
    NotificationOverrideLabelMap,
    NotificationOverrideMap,
    NotificationSettingsResponse,
} from "@/lib/types";
import { ensurePublishedDmEncryptionKeyForCurrentUser } from "@/lib/dm-encryption";
import { logger } from "@/lib/client-logger";

interface NotificationSettingsProps {
    onSettingsChange?: (settings: NotificationSettingsResponse) => void;
}

type OverrideScopeKey =
    | "serverOverrides"
    | "channelOverrides"
    | "conversationOverrides";

interface OverrideSectionConfig {
    key: OverrideScopeKey;
    emptyLabel: string;
    icon: React.ReactNode;
    title: string;
}

interface ManageOverrideDialogState {
    initialOverride?: NotificationOverride;
    open: boolean;
    targetId: string;
    targetName: string;
    targetType: "server" | "channel" | "conversation";
}

const DEFAULT_TIMEZONE = "UTC";
const DM_ENCRYPTION_LOCAL_STORAGE_KEY = "firepit.dmEncryptionEnabled";

const OVERRIDE_SECTIONS: OverrideSectionConfig[] = [
    {
        key: "serverOverrides",
        title: "Server overrides",
        emptyLabel: "No server-level overrides yet",
        icon: <Shield className="h-4 w-4" />,
    },
    {
        key: "channelOverrides",
        title: "Channel overrides",
        emptyLabel: "No channel overrides yet",
        icon: <Hash className="h-4 w-4" />,
    },
    {
        key: "conversationOverrides",
        title: "Direct message overrides",
        emptyLabel: "No DM overrides yet",
        icon: <MessageSquare className="h-4 w-4" />,
    },
];

// Common timezone list
const TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Asia/Dubai",
    "Australia/Sydney",
];

interface NotificationLevelOption {
    value: NotificationLevel;
    label: string;
    description: string;
    icon: React.ReactNode;
}

const LEVEL_OPTIONS: NotificationLevelOption[] = [
    {
        value: "all",
        label: "All messages",
        description: "Notify me for all messages",
        icon: <Bell className="h-4 w-4" />,
    },
    {
        value: "mentions",
        label: "Only @mentions",
        description: "Only notify when I'm mentioned",
        icon: <AtSign className="h-4 w-4" />,
    },
    {
        value: "nothing",
        label: "Nothing",
        description: "Don't notify me",
        icon: <BellOff className="h-4 w-4" />,
    },
];

function getDefaultTimezone(): string {
    if (typeof Intl === "undefined") {
        return DEFAULT_TIMEZONE;
    }

    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

function readLocalDmEncryptionPreference(): boolean | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem(DM_ENCRYPTION_LOCAL_STORAGE_KEY);
    if (raw === "true") {
        return true;
    }
    if (raw === "false") {
        return false;
    }

    return null;
}

function writeLocalDmEncryptionPreference(value: boolean): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(
        DM_ENCRYPTION_LOCAL_STORAGE_KEY,
        String(value),
    );
}

function formatNotificationLevel(level: NotificationLevel): string {
    switch (level) {
        case "all": {
            return "All messages";
        }
        case "mentions": {
            return "Mentions only";
        }
        case "nothing": {
            return "Nothing";
        }
        default: {
            return level;
        }
    }
}

function formatMutedUntil(mutedUntil: string | undefined): string {
    if (!mutedUntil) {
        return "Muted until you unmute";
    }

    const date = new Date(mutedUntil);
    if (Number.isNaN(date.getTime())) {
        return "Mute expires at an unknown time";
    }

    const formatted = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);

    if (date.getTime() < Date.now()) {
        return `Expired ${formatted}`;
    }

    return `Muted until ${formatted}`;
}

function getOverrideCount(
    overrides: NotificationOverrideMap | undefined,
): number {
    return Object.keys(overrides ?? {}).length;
}

function getOverrideEntries(overrides: NotificationOverrideMap | undefined) {
    return Object.entries(overrides ?? {}).sort(([leftId], [rightId]) =>
        leftId.localeCompare(rightId),
    );
}

function getOverrideStatus(mutedUntil: string | undefined): {
    label: string;
    tone: "active" | "expired" | "persistent";
} {
    if (!mutedUntil) {
        return { label: "Until unmuted", tone: "persistent" };
    }

    const expiration = new Date(mutedUntil);
    if (Number.isNaN(expiration.getTime())) {
        return { label: "Unknown expiry", tone: "expired" };
    }

    if (expiration.getTime() < Date.now()) {
        return { label: "Expired", tone: "expired" };
    }

    return { label: "Active", tone: "active" };
}

function getOverrideStatusClassName(
    tone: "active" | "expired" | "persistent",
): string {
    switch (tone) {
        case "active": {
            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        }
        case "persistent": {
            return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
        }
        case "expired": {
            return "border-border bg-muted text-muted-foreground";
        }
    }
}

function isExpiredOverride(override: NotificationOverride): boolean {
    if (!override.mutedUntil) {
        return false;
    }

    const expiration = new Date(override.mutedUntil);
    if (Number.isNaN(expiration.getTime())) {
        return true;
    }

    return expiration.getTime() < Date.now();
}

function matchesOverrideFilter(
    filter: string,
    overrideId: string,
    label:
        | NotificationOverrideLabelMap[keyof NotificationOverrideLabelMap][string]
        | undefined,
): boolean {
    if (!filter) {
        return true;
    }

    const haystack = [overrideId, label?.title, label?.subtitle, label?.meta]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

    return haystack.includes(filter.toLowerCase());
}

function createEmptyOverrideLabels(): NotificationOverrideLabelMap {
    return {
        serverOverrides: {},
        channelOverrides: {},
        conversationOverrides: {},
    };
}

function getTargetTypeForScope(
    scope: OverrideScopeKey,
): ManageOverrideDialogState["targetType"] {
    switch (scope) {
        case "serverOverrides": {
            return "server";
        }
        case "channelOverrides": {
            return "channel";
        }
        case "conversationOverrides": {
            return "conversation";
        }
    }
}

export function NotificationSettings({
    onSettingsChange,
}: NotificationSettingsProps) {
    const [settings, setSettings] =
        useState<NotificationSettingsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [globalLevel, setGlobalLevel] = useState<NotificationLevel>("all");
    const [directMessagePrivacy, setDirectMessagePrivacy] =
        useState<DirectMessagePrivacy>("everyone");
    const [dmEncryptionEnabled, setDmEncryptionEnabled] = useState(false);
    const [desktopEnabled, setDesktopEnabled] = useState(true);
    const [pushEnabled, setPushEnabled] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
    const [quietHoursStart, setQuietHoursStart] = useState("22:00");
    const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
    const [quietHoursTimezone, setQuietHoursTimezone] =
        useState(DEFAULT_TIMEZONE);
    const [overrideMutationKey, setOverrideMutationKey] = useState<
        string | null
    >(null);
    const [overrideLabels, setOverrideLabels] =
        useState<NotificationOverrideLabelMap>(createEmptyOverrideLabels);
    const [manageOverrideDialog, setManageOverrideDialog] =
        useState<ManageOverrideDialogState>({
            open: false,
            targetId: "",
            targetName: "",
            targetType: "channel",
        });
    const [overrideFilter, setOverrideFilter] = useState("");

    // Browser notification permission state
    const [browserPermission, setBrowserPermission] =
        useState<NotificationPermission>("default");
    const [isRequestingPermission, setIsRequestingPermission] = useState(false);

    // Check browser notification permission on mount
    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            setBrowserPermission(Notification.permission);
        }

        // Resolve timezone after hydration to avoid server/client timezone mismatches.
        setQuietHoursTimezone((currentValue) =>
            currentValue === DEFAULT_TIMEZONE
                ? getDefaultTimezone()
                : currentValue,
        );
    }, []);

    const deferredOverrideFilter = useDeferredValue(overrideFilter);

    const hydrateFormState = useCallback(
        (data: NotificationSettingsResponse) => {
            setSettings(data);
            startTransition(() => {
                setOverrideLabels(
                    data.overrideLabels ?? createEmptyOverrideLabels(),
                );
            });
            setGlobalLevel(data.globalNotifications);
            setDirectMessagePrivacy(data.directMessagePrivacy ?? "everyone");
            const serverDmEncryptionEnabled = data.dmEncryptionEnabled;
            const dmEncryptionEnabledNext =
                typeof serverDmEncryptionEnabled === "boolean"
                    ? serverDmEncryptionEnabled
                    : readLocalDmEncryptionPreference() ?? false;

            setDmEncryptionEnabled(dmEncryptionEnabledNext);
            writeLocalDmEncryptionPreference(dmEncryptionEnabledNext);
            setDesktopEnabled(data.desktopNotifications);
            setPushEnabled(data.pushNotifications);
            setSoundEnabled(data.notificationSound);

            const timezone = data.quietHoursTimezone || getDefaultTimezone();
            const quietHoursAreEnabled = Boolean(
                data.quietHoursStart && data.quietHoursEnd,
            );

            setQuietHoursEnabled(quietHoursAreEnabled);
            setQuietHoursStart(data.quietHoursStart ?? "22:00");
            setQuietHoursEnd(data.quietHoursEnd ?? "08:00");
            setQuietHoursTimezone(timezone);
        },
        [],
    );

    const applySettingsResponse = useCallback(
        (
            data:
                | NotificationSettingsResponse
                | {
                      message: string;
                      settings: NotificationSettingsResponse;
                  },
        ) => {
            const nextSettings = "settings" in data ? data.settings : data;
            hydrateFormState(nextSettings);
            onSettingsChange?.(nextSettings);
            return nextSettings;
        },
        [hydrateFormState, onSettingsChange],
    );

    const fetchSettings = useCallback(
        async (options?: { silent?: boolean }) => {
            try {
                const response = await fetch("/api/notifications/settings", {
                    cache: "no-store",
                });
                if (!response.ok) {
                    throw new Error("Failed to fetch settings");
                }
                const data =
                    (await response.json()) as NotificationSettingsResponse;
                hydrateFormState(data);
            } catch (error) {
                if (!options?.silent) {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : "Failed to load settings",
                    );
                }
            }
        },
        [hydrateFormState],
    );

    // Fetch settings on mount
    useEffect(() => {
        const loadInitialSettings = async () => {
            await fetchSettings();
            setIsLoading(false);
        };

        void loadInitialSettings();
    }, [fetchSettings]);

    const requestBrowserPermission = useCallback(async () => {
        if (typeof window === "undefined" || !("Notification" in window)) {
            toast.error("Notifications are not supported by your browser");
            return;
        }

        if (browserPermission === "denied") {
            toast.error(
                "Notifications are blocked. Please enable them in your browser settings.",
            );
            return;
        }

        setIsRequestingPermission(true);
        try {
            const permission = await Notification.requestPermission();
            setBrowserPermission(permission);

            if (permission === "granted") {
                toast.success("Notification permission granted!");
            } else if (permission === "denied") {
                toast.error(
                    "Notification permission denied. You can change this in your browser settings.",
                );
            }
        } catch {
            toast.error("Failed to request notification permission");
        } finally {
            setIsRequestingPermission(false);
        }
    }, [browserPermission]);

    const handleDmEncryptionEnabledChange = useCallback((checked: boolean) => {
        setDmEncryptionEnabled(checked);
        writeLocalDmEncryptionPreference(checked);
    }, []);

    const saveSettings = useCallback(async () => {
        setIsSaving(true);
        try {
            const payload = {
                globalNotifications: globalLevel,
                directMessagePrivacy,
                dmEncryptionEnabled,
                desktopNotifications: desktopEnabled,
                pushNotifications: pushEnabled,
                notificationSound: soundEnabled,
                quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
                quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
                quietHoursTimezone: quietHoursEnabled
                    ? quietHoursTimezone
                    : null,
            };

            const response = await fetch("/api/notifications/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { error?: string };
                throw new Error(errorData.error ?? "Failed to save settings");
            }

            applySettingsResponse(
                (await response.json()) as
                    | NotificationSettingsResponse
                    | {
                          message: string;
                          settings: NotificationSettingsResponse;
                      },
            );

            writeLocalDmEncryptionPreference(dmEncryptionEnabled);
            toast.success("Settings saved");

            if (dmEncryptionEnabled) {
                try {
                    await ensurePublishedDmEncryptionKeyForCurrentUser();
                } catch (error) {
                    logger.error(
                        "Failed to publish DM encryption key from notification settings",
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                    );
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : "Failed to publish encryption key",
                    );
                }
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to save settings",
            );
        } finally {
            setIsSaving(false);
        }
    }, [
        globalLevel,
        directMessagePrivacy,
        dmEncryptionEnabled,
        desktopEnabled,
        pushEnabled,
        soundEnabled,
        quietHoursEnabled,
        quietHoursStart,
        quietHoursEnd,
        quietHoursTimezone,
        applySettingsResponse,
        hydrateFormState,
    ]);

    const updateOverrideMap = useCallback(
        async (
            scope: OverrideScopeKey,
            nextOverrides: NotificationOverrideMap,
        ) => {
            setOverrideMutationKey(scope);
            try {
                const response = await fetch("/api/notifications/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        [scope]: nextOverrides,
                    }),
                });

                if (!response.ok) {
                    const errorData = (await response.json()) as {
                        error?: string;
                    };
                    throw new Error(
                        errorData.error ??
                            "Failed to update notification override",
                    );
                }

                applySettingsResponse(
                    (await response.json()) as
                        | NotificationSettingsResponse
                        | {
                              message: string;
                              settings: NotificationSettingsResponse;
                          },
                );
                toast.success("Notification override updated");
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Failed to update notification override",
                );
            } finally {
                setOverrideMutationKey(null);
            }
        },
        [applySettingsResponse],
    );

    const updateOverrideMaps = useCallback(
        async (
            nextOverrides: Partial<
                Record<OverrideScopeKey, NotificationOverrideMap>
            >,
            options: {
                emptyError: string;
                loadingKey: string;
                successMessage: string;
            },
        ) => {
            setOverrideMutationKey(options.loadingKey);
            try {
                const response = await fetch("/api/notifications/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(nextOverrides),
                });

                if (!response.ok) {
                    const errorData = (await response.json()) as {
                        error?: string;
                    };
                    throw new Error(errorData.error ?? options.emptyError);
                }

                applySettingsResponse(
                    (await response.json()) as
                        | NotificationSettingsResponse
                        | {
                              message: string;
                              settings: NotificationSettingsResponse;
                          },
                );
                toast.success(options.successMessage);
            } catch (error) {
                toast.error(
                    error instanceof Error ? error.message : options.emptyError,
                );
            } finally {
                setOverrideMutationKey(null);
            }
        },
        [applySettingsResponse],
    );

    const clearOverride = useCallback(
        async (scope: OverrideScopeKey, overrideId: string) => {
            if (!settings) {
                return;
            }

            const nextOverrides = {
                ...(settings[scope] ?? {}),
            };
            delete nextOverrides[overrideId];

            await updateOverrideMap(scope, nextOverrides);
        },
        [settings, updateOverrideMap],
    );

    const expiredOverrideCount = useMemo(
        () =>
            OVERRIDE_SECTIONS.reduce(
                (count, section) =>
                    count +
                    getOverrideEntries(settings?.[section.key]).filter(
                        ([, override]) => isExpiredOverride(override),
                    ).length,
                0,
            ),
        [settings],
    );

    const channelOverrideCount = getOverrideCount(settings?.channelOverrides);

    const clearExpiredOverrides = useCallback(async () => {
        if (!settings || expiredOverrideCount === 0) {
            return;
        }

        const nextOverrides = OVERRIDE_SECTIONS.reduce(
            (accumulator, section) => {
                const currentOverrides = settings[section.key] ?? {};
                accumulator[section.key] = Object.fromEntries(
                    Object.entries(currentOverrides).filter(
                        ([, override]) => !isExpiredOverride(override),
                    ),
                );
                return accumulator;
            },
            {} as Record<OverrideScopeKey, NotificationOverrideMap>,
        );

        await updateOverrideMaps(nextOverrides, {
            emptyError: "Failed to clear expired overrides",
            loadingKey: "bulk-clear-expired",
            successMessage: "Expired overrides cleared",
        });
    }, [expiredOverrideCount, settings, updateOverrideMaps]);

    const resetChannelOverrides = useCallback(async () => {
        if (!settings || channelOverrideCount === 0) {
            return;
        }

        await updateOverrideMaps(
            { channelOverrides: {} },
            {
                emptyError: "Failed to reset channel overrides",
                loadingKey: "bulk-reset-channels",
                successMessage: "Channel overrides reset",
            },
        );
    }, [channelOverrideCount, settings, updateOverrideMaps]);

    const totalOverrideCount =
        getOverrideCount(settings?.serverOverrides) +
        getOverrideCount(settings?.channelOverrides) +
        getOverrideCount(settings?.conversationOverrides);

    const filteredOverrideCount = useMemo(
        () =>
            OVERRIDE_SECTIONS.reduce((count, section) => {
                const labels = overrideLabels[section.key];
                return (
                    count +
                    getOverrideEntries(settings?.[section.key]).filter(
                        ([overrideId]) =>
                            matchesOverrideFilter(
                                deferredOverrideFilter,
                                overrideId,
                                labels[overrideId],
                            ),
                    ).length
                );
            }, 0),
        [deferredOverrideFilter, overrideLabels, settings],
    );

    const openManageOverrideDialog = useCallback(
        (
            scope: OverrideScopeKey,
            overrideId: string,
            override: NotificationOverride,
        ) => {
            const label = overrideLabels[scope][overrideId];
            setManageOverrideDialog({
                open: true,
                targetId: overrideId,
                targetName: label?.title ?? overrideId,
                targetType: getTargetTypeForScope(scope),
                initialOverride: override,
            });
        },
        [overrideLabels],
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Global Notification Level */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Bell className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                        Default Notification Level
                    </h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    This applies to all servers and channels unless you override
                    them individually.
                </p>
                <div className="grid gap-2">
                    {LEVEL_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setGlobalLevel(option.value)}
                            className={`flex items-center gap-3 rounded-md border p-4 text-left transition-colors hover:bg-muted ${
                                globalLevel === option.value
                                    ? "border-primary bg-primary/5"
                                    : "border-border"
                            }`}
                        >
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-md ${
                                    globalLevel === option.value
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                }`}
                            >
                                {option.icon}
                            </div>
                            <div className="flex-1">
                                <span className="font-medium">
                                    {option.label}
                                </span>
                                <p className="text-sm text-muted-foreground">
                                    {option.description}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </Card>

            <Card className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <BellOff className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold">
                                Per-Scope Overrides
                            </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            These overrides are written from server, channel,
                            and DM mute controls. The most specific override
                            wins over your global default.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="secondary"
                            className="shrink-0 whitespace-nowrap"
                        >
                            {totalOverrideCount} active
                        </Badge>
                    </div>
                </div>

                {totalOverrideCount > 0 ? (
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="sm:max-w-xs sm:flex-1">
                            <Label
                                htmlFor="override-filter"
                                className="sr-only"
                            >
                                Filter notification overrides
                            </Label>
                            <Input
                                id="override-filter"
                                value={overrideFilter}
                                onChange={(event) =>
                                    setOverrideFilter(event.target.value)
                                }
                                placeholder="Filter overrides by name or id"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Showing {filteredOverrideCount} of{" "}
                            {totalOverrideCount} overrides
                        </p>
                    </div>
                ) : null}

                {totalOverrideCount > 0 ? (
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void clearExpiredOverrides()}
                            disabled={
                                expiredOverrideCount === 0 ||
                                overrideMutationKey !== null
                            }
                        >
                            Clear expired overrides ({expiredOverrideCount})
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void resetChannelOverrides()}
                            disabled={
                                channelOverrideCount === 0 ||
                                overrideMutationKey !== null
                            }
                        >
                            Reset channel overrides ({channelOverrideCount})
                        </Button>
                        <p className="text-sm text-muted-foreground">
                            Bulk actions only affect stored overrides. Your
                            global defaults stay unchanged.
                        </p>
                    </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-3">
                    {OVERRIDE_SECTIONS.map((section) => {
                        const entries = getOverrideEntries(
                            settings?.[section.key],
                        );
                        const labels = overrideLabels[section.key];
                        const filteredEntries = entries.filter(([overrideId]) =>
                            matchesOverrideFilter(
                                deferredOverrideFilter,
                                overrideId,
                                labels[overrideId],
                            ),
                        );

                        return (
                            <div
                                key={section.key}
                                className="rounded-xl border border-border/70 bg-background/60 p-4"
                            >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        {section.icon}
                                        <span>{section.title}</span>
                                    </div>
                                    <Badge variant="outline">
                                        {filteredEntries.length}
                                    </Badge>
                                </div>

                                {entries.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {section.emptyLabel}
                                    </p>
                                ) : filteredEntries.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No overrides match the current filter.
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredEntries.map(
                                            ([overrideId, override]) => {
                                                const labelEntry =
                                                    labels[overrideId];
                                                const status =
                                                    getOverrideStatus(
                                                        override.mutedUntil,
                                                    );

                                                return (
                                                    <div
                                                        key={overrideId}
                                                        className="rounded-lg border border-border/70 p-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="truncate text-sm font-medium text-foreground">
                                                                        {labelEntry?.title ??
                                                                            overrideId}
                                                                    </p>
                                                                    <span
                                                                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getOverrideStatusClassName(
                                                                            status.tone,
                                                                        )}`}
                                                                    >
                                                                        {
                                                                            status.label
                                                                        }
                                                                    </span>
                                                                </div>
                                                                {labelEntry?.subtitle ? (
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {
                                                                            labelEntry.subtitle
                                                                        }
                                                                    </p>
                                                                ) : null}
                                                                {labelEntry?.meta ? (
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {
                                                                            labelEntry.meta
                                                                        }
                                                                    </p>
                                                                ) : null}
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatNotificationLevel(
                                                                        override.level,
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatMutedUntil(
                                                                        override.mutedUntil,
                                                                    )}
                                                                </p>
                                                                <p className="truncate font-mono text-[11px] text-muted-foreground/80">
                                                                    {overrideId}
                                                                </p>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        openManageOverrideDialog(
                                                                            section.key,
                                                                            overrideId,
                                                                            override,
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        overrideMutationKey ===
                                                                        section.key
                                                                    }
                                                                >
                                                                    Manage
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() =>
                                                                        void clearOverride(
                                                                            section.key,
                                                                            overrideId,
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        overrideMutationKey ===
                                                                        section.key
                                                                    }
                                                                    aria-label={`Clear notification override ${overrideId}`}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card className="p-6">
                <div className="mb-4 flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                        Direct Message Privacy
                    </h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                    Choose whether anyone can message you or whether new direct
                    messages are limited to accepted friends.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="direct-message-privacy">
                        Who can send you direct messages
                    </Label>
                    <Select
                        onValueChange={(value) =>
                            setDirectMessagePrivacy(
                                value as DirectMessagePrivacy,
                            )
                        }
                        value={directMessagePrivacy}
                    >
                        <SelectTrigger id="direct-message-privacy">
                            <SelectValue placeholder="Select who can message you" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="everyone">Everyone</SelectItem>
                            <SelectItem value="friends">
                                Friends only
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        Existing one-to-one conversations stay visible, but new
                        non-friend messages are blocked when friends-only mode
                        is enabled.
                    </p>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-md border p-4">
                    <div>
                        <Label htmlFor="dm-encryption" className="font-medium">
                            Optional DM text encryption
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Enable client-side ChaCha20-Poly1305 encryption for
                            one-to-one DMs when both users opt in.
                        </p>
                    </div>
                    <Switch
                        id="dm-encryption"
                        checked={dmEncryptionEnabled}
                        onCheckedChange={handleDmEncryptionEnabledChange}
                    />
                </div>
            </Card>

            {/* Browser Notification Permission */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Bell className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                        Browser Notifications
                    </h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Control whether your browser can show desktop notifications.
                </p>
                <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-md border p-4">
                        <div className="flex-1">
                            <p className="font-medium">
                                Current Permission Status
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {browserPermission === "granted" &&
                                    "✓ Granted - You will receive desktop notifications"}
                                {browserPermission === "denied" &&
                                    "✗ Denied - Please enable in browser settings"}
                                {browserPermission === "default" &&
                                    "⚠ Not set - Click to enable notifications"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {browserPermission === "granted" && (
                                <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600 dark:text-green-400">
                                    Enabled
                                </span>
                            )}
                            {browserPermission === "denied" && (
                                <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400">
                                    Blocked
                                </span>
                            )}
                            {browserPermission === "default" && (
                                <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                                    Not Set
                                </span>
                            )}
                        </div>
                    </div>

                    {browserPermission !== "granted" && (
                        <div className="flex flex-col gap-2">
                            <Button
                                onClick={requestBrowserPermission}
                                disabled={
                                    isRequestingPermission ||
                                    browserPermission === "denied"
                                }
                                className="w-full"
                            >
                                {isRequestingPermission
                                    ? "Requesting..."
                                    : "Enable Browser Notifications"}
                            </Button>
                            {browserPermission === "denied" && (
                                <p className="text-xs text-muted-foreground">
                                    Notifications are blocked. To enable them,
                                    click the icon in your browser&apos;s
                                    address bar and allow notifications for this
                                    site.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Notification Methods */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Volume2 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                        Notification Methods
                    </h3>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="desktop" className="font-medium">
                                Desktop notifications
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Show notifications on your desktop
                            </p>
                        </div>
                        <Switch
                            id="desktop"
                            checked={desktopEnabled}
                            onCheckedChange={setDesktopEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="push" className="font-medium">
                                Push notifications
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Receive notifications on your mobile device
                            </p>
                        </div>
                        <Switch
                            id="push"
                            checked={pushEnabled}
                            onCheckedChange={setPushEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label
                                htmlFor="sound"
                                className="font-medium flex items-center gap-2"
                            >
                                {soundEnabled ? (
                                    <Volume2 className="h-4 w-4" />
                                ) : (
                                    <VolumeX className="h-4 w-4" />
                                )}
                                Notification sound
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Play a sound for new notifications
                            </p>
                        </div>
                        <Switch
                            id="sound"
                            checked={soundEnabled}
                            onCheckedChange={setSoundEnabled}
                        />
                    </div>
                </div>
            </Card>

            {/* Quiet Hours */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Moon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Quiet Hours</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Suppress notifications during specific hours in your chosen
                    timezone.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label
                                htmlFor="quiet-enabled"
                                className="font-medium"
                            >
                                Enable quiet hours
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                No notifications during the specified time
                            </p>
                        </div>
                        <Switch
                            id="quiet-enabled"
                            checked={quietHoursEnabled}
                            onCheckedChange={setQuietHoursEnabled}
                        />
                    </div>

                    {quietHoursEnabled && (
                        <div className="grid gap-4 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="start-time"
                                        className="flex items-center gap-2"
                                    >
                                        <Clock className="h-4 w-4" />
                                        Start time
                                    </Label>
                                    <Input
                                        id="start-time"
                                        type="time"
                                        value={quietHoursStart}
                                        onChange={(e) =>
                                            setQuietHoursStart(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="end-time"
                                        className="flex items-center gap-2"
                                    >
                                        <Clock className="h-4 w-4" />
                                        End time
                                    </Label>
                                    <Input
                                        id="end-time"
                                        type="time"
                                        value={quietHoursEnd}
                                        onChange={(e) =>
                                            setQuietHoursEnd(e.target.value)
                                        }
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="timezone">Timezone</Label>
                                <Select
                                    value={quietHoursTimezone}
                                    onValueChange={setQuietHoursTimezone}
                                >
                                    <SelectTrigger id="timezone">
                                        <SelectValue placeholder="Select timezone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TIMEZONES.map((tz) => (
                                            <SelectItem key={tz} value={tz}>
                                                {tz}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <MuteDialog
                open={manageOverrideDialog.open}
                onOpenChange={(open) =>
                    setManageOverrideDialog((prev) => ({ ...prev, open }))
                }
                targetId={manageOverrideDialog.targetId}
                targetName={manageOverrideDialog.targetName}
                targetType={manageOverrideDialog.targetType}
                initialOverride={manageOverrideDialog.initialOverride}
                onMuteComplete={() => {
                    void fetchSettings({ silent: true });
                }}
            />

            {/* Debug info */}
            {settings && process.env.NODE_ENV === "development" && (
                <Card className="p-4 bg-muted/50">
                    <p className="text-xs text-muted-foreground font-mono">
                        Last updated: {settings.$updatedAt}
                    </p>
                </Card>
            )}
        </div>
    );
}
