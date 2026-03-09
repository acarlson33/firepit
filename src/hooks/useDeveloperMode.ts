"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PreferencesResponse = {
    showDocsInNavigation: boolean;
};

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

async function updateDeveloperModePreference(showDocsInNavigation: boolean) {
    const response = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ showDocsInNavigation }),
    });

    if (!response.ok) {
        throw new Error("Failed to save docs navigation preference");
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
        refetchOnWindowFocus: true,
    });

    const updatePreferenceMutation = useMutation({
        mutationFn: updateDeveloperModePreference,
        onMutate: async (nextValue) => {
            await queryClient.cancelQueries({ queryKey });
            const previousValue =
                queryClient.getQueryData<PreferencesResponse>(queryKey);

            queryClient.setQueryData<PreferencesResponse>(queryKey, {
                showDocsInNavigation: nextValue,
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

    function setDeveloperMode(nextValue: boolean) {
        if (!isEnabled) {
            return;
        }

        updatePreferenceMutation.mutate(nextValue);
    }

    return {
        developerMode: preferenceQuery.data?.showDocsInNavigation ?? true,
        isLoaded:
            !isEnabled || preferenceQuery.isSuccess || preferenceQuery.isError,
        isSaving: updatePreferenceMutation.isPending,
        setDeveloperMode,
    };
}
