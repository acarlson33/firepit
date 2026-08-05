import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Channel, Client, Query } from "react-native-appwrite";
import type { RealtimeResponseEvent } from "react-native-appwrite";
import { extractAppwriteConfig } from "@/lib/firepit/bootstrap";
import type { InstanceMetadata } from "@/lib/firepit/types";

const DATABASE_ID = "main";

interface UseRealtimeMessagesOptions {
    instance: InstanceMetadata | null;
    accessToken: string | null;
    collectionId: string;
    filterField: string;
    filterValue: string | null | undefined;
    onMessageEvent: () => void;
}

export function useRealtimeMessages({
    instance,
    accessToken,
    collectionId,
    filterField,
    filterValue,
    onMessageEvent,
}: UseRealtimeMessagesOptions) {
    const onEventRef = useRef(onMessageEvent);
    onEventRef.current = onMessageEvent;

    const subRef = useRef<(() => void) | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const doSubscribe = useCallback((): (() => void) | null => {
        if (!filterValue || !accessToken) return null;

        const config = extractAppwriteConfig(instance ?? {});
        if (!config) return null;

        const channel = Channel.database(DATABASE_ID)
            .collection(collectionId)
            .document()
            .toString();

        const handleEvent = (
            response: RealtimeResponseEvent<Record<string, unknown>>,
        ) => {
            const payload = response.payload as
                | Record<string, unknown>
                | undefined;
            if (!payload) return;

            const targetValue = String(payload[filterField] ?? "");
            if (targetValue !== filterValue) return;

            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                debounceRef.current = null;
                onEventRef.current();
            }, 1000);
        };

        try {
            const client = new Client()
                .setEndpoint(config.endpoint)
                .setProject(config.project)
                .setSession(accessToken)
                .setPlatform("com.acarlson33.firepit");

            const queryStr = Query.equal(filterField, filterValue);
            return client.subscribe<Record<string, unknown>>(
                channel,
                handleEvent,
                [queryStr],
            );
        } catch {
            return null;
        }
    }, [instance, accessToken, collectionId, filterField, filterValue]);

    const doSubscribeRef = useRef(doSubscribe);
    doSubscribeRef.current = doSubscribe;

    // Subscribe on mount / deps change
    useEffect(() => {
        subRef.current?.();
        subRef.current = doSubscribe();

        return () => {
            subRef.current?.();
            subRef.current = null;
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
        };
    }, [doSubscribe]);

    // Unsubscribe on background, re-subscribe on foreground
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "background") {
                subRef.current?.();
                subRef.current = null;
            } else if (state === "active") {
                subRef.current?.();
                subRef.current = doSubscribeRef.current();
            }
        });

        return () => {
            subscription.remove();
        };
    }, []);
}
