"use client";

import { ArrowDown, ArrowUp, BookOpenText, PanelTop } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import type { NavigationItemPreferenceId } from "@/lib/types";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

const NAVIGATION_ITEM_COPY = {
    docs: {
        description:
            "Keep product and API documentation close at hand in the top navigation.",
        label: "Docs",
    },
    friends: {
        description:
            "Show the Friends destination and its pending-request badge in the main navigation.",
        label: "Friends",
    },
    settings: {
        description:
            "Keep account and interface settings visible in the top navigation.",
        label: "Settings",
    },
} as const satisfies Record<
    NavigationItemPreferenceId,
    { description: string; label: string }
>;

function getVisibilityKey(item: NavigationItemPreferenceId) {
    switch (item) {
        case "docs": {
            return "showDocsInNavigation";
        }
        case "friends": {
            return "showFriendsInNavigation";
        }
        case "settings": {
            return "showSettingsInNavigation";
        }
        default: {
            return "showDocsInNavigation";
        }
    }
}

export function DeveloperModeSettings() {
    const { userData } = useAuth();
    const userId = userData?.userId ?? null;
    const {
        isLoaded,
        isSaving,
        navigationPreferences,
        updateNavigationPreferences,
    } = useDeveloperMode(userId);

    const orderedItems = navigationPreferences.navigationItemOrder;

    function moveItem(item: NavigationItemPreferenceId, direction: -1 | 1) {
        const currentIndex = orderedItems.indexOf(item);
        const targetIndex = currentIndex + direction;

        if (
            currentIndex === -1 ||
            targetIndex < 0 ||
            targetIndex >= orderedItems.length
        ) {
            return;
        }

        const nextOrder = [...orderedItems];
        const [movedItem] = nextOrder.splice(currentIndex, 1);
        nextOrder.splice(targetIndex, 0, movedItem);

        updateNavigationPreferences({
            navigationItemOrder: nextOrder,
        });
    }

    return (
        <div className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-5">
            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <PanelTop className="h-5 w-5" />
                </span>
                <div className="space-y-2">
                    <p className="text-base font-semibold text-foreground">
                        Customize top navigation
                    </p>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Choose which optional destinations stay visible and set
                        the order they appear in, while keeping the core app
                        routes fixed.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Home and Chat always stay pinned. Moderation and Admin
                        remain role-gated when available.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {orderedItems.map((item, index) => {
                    const visibilityKey = getVisibilityKey(item);
                    const isVisible = navigationPreferences[visibilityKey];
                    const copy = NAVIGATION_ITEM_COPY[item];

                    return (
                        <div
                            key={item}
                            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <BookOpenText className="h-4 w-4 text-primary" />
                                    <Label
                                        className="text-base font-semibold text-foreground"
                                        htmlFor={`navigation-${item}`}
                                    >
                                        {copy.label}
                                    </Label>
                                </div>
                                <p className="max-w-2xl text-sm text-muted-foreground">
                                    {copy.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Position {index + 1} of{" "}
                                    {orderedItems.length}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 self-start">
                                <Switch
                                    checked={isVisible}
                                    disabled={!isLoaded || !userId || isSaving}
                                    id={`navigation-${item}`}
                                    onCheckedChange={(checked) =>
                                        updateNavigationPreferences({
                                            [visibilityKey]: checked,
                                        })
                                    }
                                />
                                <Button
                                    aria-label={`Move ${copy.label} earlier in navigation`}
                                    disabled={
                                        !isLoaded ||
                                        !userId ||
                                        isSaving ||
                                        index === 0
                                    }
                                    onClick={() => moveItem(item, -1)}
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                    aria-label={`Move ${copy.label} later in navigation`}
                                    disabled={
                                        !isLoaded ||
                                        !userId ||
                                        isSaving ||
                                        index === orderedItems.length - 1
                                    }
                                    onClick={() => moveItem(item, 1)}
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
