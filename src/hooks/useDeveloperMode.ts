"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NavigationPreferences } from "@/lib/types";

type PreferencesResponse = NavigationPreferences;

type PreferencesPatch = Partial<NavigationPreferences>;

function getDeveloperModeQueryKey(userId: string | null) {
    return ["developer-mode", userId] as const;
}

async function fetchDeveloperModePreference() {
    const response = await fetch("/api/me/preferences", {
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error("Failed to load docs navigation preference");
    }

    return (await response.json()) as PreferencesResponse;
}

async function updateDeveloperModePreference(patch: PreferencesPatch) {
    const response = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(patch),
    });

    if (!response.ok) {
        throw new Error("Failed to save navigation preferences");
    }

    return (await response.json()) as PreferencesResponse;
}

export function useDeveloperMode(userId: string | null) {
    const queryClient = useQueryClient();
    const isEnabled = Boolean(userId);
    const queryKey = getDeveloperModeQueryKey(userId);

    const preferenceQuery = useQuery({
        queryKey,
        queryFn: fetchDeveloperModePreference,
        enabled: isEnabled,
        staleTime: 30 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    const updatePreferenceMutation = useMutation({
        mutationFn: updateDeveloperModePreference,
        onMutate: async (patch) => {
            await queryClient.cancelQueries({ queryKey });
            const previousValue =
                queryClient.getQueryData<PreferencesResponse>(queryKey);

            if (!previousValue) {
                return { previousValue };
            }

            queryClient.setQueryData<PreferencesResponse>(queryKey, {
                ...previousValue,
                ...patch,
                navigationItemOrder:
                    patch.navigationItemOrder ??
                    previousValue.navigationItemOrder,
            });

            return { previousValue };
        },
        onError: (_error, _nextValue, context) => {
            if (context?.previousValue) {
                queryClient.setQueryData(queryKey, context.previousValue);
            }
        },
        onSuccess: (data) => {
            queryClient.setQueryData(queryKey, data);
        },
    });

    const navigationPreferences: NavigationPreferences =
        preferenceQuery.data ?? {
            showDocsInNavigation: true,
            showFriendsInNavigation: true,
            showSettingsInNavigation: true,
            navigationItemOrder: ["docs", "friends", "settings"],
        };

    function setDeveloperMode(nextValue: boolean) {
        if (!isEnabled) {
            return;
        }

        updatePreferenceMutation.mutate({
            showDocsInNavigation: nextValue,
        });
    }

    function updateNavigationPreferences(patch: PreferencesPatch) {
        if (!isEnabled) {
            return;
        }

        updatePreferenceMutation.mutate(patch);
    }

    return {
        developerMode: navigationPreferences.showDocsInNavigation,
        navigationPreferences,
        isLoaded:
            !isEnabled || preferenceQuery.isSuccess || preferenceQuery.isError,
        isSaving: updatePreferenceMutation.isPending,
        setDeveloperMode,
        updateNavigationPreferences,
    };
}
