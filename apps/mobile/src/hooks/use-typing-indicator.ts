import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Client, Realtime } from "react-native-appwrite";
import { getProfilesBatch } from "@/lib/profile-cache";
import { authHeaders } from "@/lib/firepit/http";

type TypingUser = {
    userId: string;
    userName?: string;
    updatedAt: string;
};

const COOLDOWN_MS = 2000;
const TYPING_IDLE_MS = 1500;
const STALE_THRESHOLD_MS = 5000;

export function useTypingIndicator(
    instanceUrl: string | null,
    accessToken: string | null,
    currentUserId: string | null,
    contextId: string | null | undefined,
    userName: string | null | undefined,
    projectId?: string | null,
    appwriteEndpoint?: string | null,
) {
    const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser>>(
        {},
    );

    const typingPresenceIdRef = useRef<string | null>(null);
    const typingPresenceCreatedRef = useRef<boolean>(false);
    const lastTypingSentAt = useRef<number>(0);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    useEffect(() => {
        setTypingUsers({});
        typingPresenceCreatedRef.current = false;
        typingPresenceIdRef.current = null;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    }, [contextId]);

    const sendTypingPresence = useCallback(
        async (state: boolean) => {
            if (!instanceUrl || !accessToken || !currentUserId || !contextId)
                return;

            if (state && !typingPresenceIdRef.current) {
                typingPresenceIdRef.current = currentUserId;
            }

            if (state && typingPresenceCreatedRef.current) {
                const elapsed = Date.now() - lastTypingSentAt.current;
                if (elapsed < COOLDOWN_MS) return;
            }

            lastTypingSentAt.current = Date.now();

            if (!state && !typingPresenceCreatedRef.current) return;

            try {
                if (state) {
                    const response = await fetch(`${instanceUrl}/api/typing`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...authHeaders(accessToken),
                        },
                        body: JSON.stringify({
                            presenceId: typingPresenceIdRef.current,
                            channelId: contextId,
                            userName,
                            expiresAt: new Date(
                                Date.now() + 4000,
                            ).toISOString(),
                        }),
                    });
                    if (response.ok) {
                        typingPresenceCreatedRef.current = true;
                    }
                } else {
                    await fetch(`${instanceUrl}/api/typing`, {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json",
                            ...authHeaders(accessToken),
                        },
                        body: JSON.stringify({
                            presenceId: typingPresenceIdRef.current,
                        }),
                    });
                    typingPresenceCreatedRef.current = false;
                    typingPresenceIdRef.current = null;
                }
            } catch {
                // ignore
            }
        },
        [
            instanceUrl,
            accessToken,
            currentUserId,
            contextId,
            userName,
        ],
    );

    const scheduleTypingStop = useCallback(() => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            void sendTypingPresence(false);
        }, TYPING_IDLE_MS);
    }, [sendTypingPresence]);

    const scheduleTypingStart = useCallback(() => {
        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = setTimeout(() => {
            void sendTypingPresence(true);
        }, 0);
    }, [sendTypingPresence]);

    const handleTypingChange = useCallback(
        (text: string) => {
            if (!currentUserId || !contextId) return;
            const isTyping = text.trim().length > 0;
            if (isTyping) {
                scheduleTypingStart();
                scheduleTypingStop();
            } else {
                if (typingDebounceRef.current)
                    clearTimeout(typingDebounceRef.current);
                void sendTypingPresence(false);
                if (typingTimeoutRef.current)
                    clearTimeout(typingTimeoutRef.current);
            }
        },
        [
            currentUserId,
            contextId,
            scheduleTypingStart,
            scheduleTypingStop,
            sendTypingPresence,
        ],
    );

    const enrichProfiles = useCallback(
        async (userIds: string[]) => {
            if (!instanceUrl || !accessToken || userIds.length === 0) return;
            try {
                const profiles = await getProfilesBatch(instanceUrl, accessToken, userIds);
                setTypingUsers((prev) => {
                    let changed = false;
                    const next = { ...prev };
                    for (const uid of userIds) {
                        const info = next[uid];
                        if (
                            info &&
                            !info.userName &&
                            profiles[uid]?.displayName
                        ) {
                            next[uid] = {
                                ...info,
                                userName: profiles[uid]!.displayName,
                            };
                            changed = true;
                        }
                    }
                    return changed ? next : prev;
                });
            } catch {
                // ignore profile enrichment failure
            }
        },
        [accessToken, instanceUrl],
    );

    // Realtime subscription for typing presence events via Appwrite Presences
    // (with AppState lifecycle to avoid "Realtime got disconnected" console.error spam)
    useEffect(() => {
        if (!instanceUrl || !accessToken || !contextId || !currentUserId) return;
        let cancelled = false;
        // Generation guards against a stale subscribe resolving after a newer
        // subscribe started (e.g. background/foreground churn), which would
        // otherwise overwrite subHandle and leak the wrong subscription.
        let generation = 0;
        let subHandle: { unsubscribe: () => Promise<void>; close: () => Promise<void> } | undefined;
        let realtimeInstance: Realtime | undefined;

        const doSubscribe = () => {
            const currentGeneration = generation;
            try {
                const endpoint = appwriteEndpoint || instanceUrl;
                const url = new URL(endpoint);
                const client = new Client()
                    .setEndpoint(url.origin)
                    .setProject(projectId ?? "")
                    .setSession(accessToken)
                    .setPlatform("com.acarlson33.firepit");

                realtimeInstance = new Realtime(client);

                void realtimeInstance.subscribe(
                    ["presences"],
                    (response) => {
                        if (cancelled) return;

                        const payload = response.payload;
                        if (!payload) return;

                        const metadata = payload.metadata as
                            | Record<string, unknown>
                            | undefined;
                        const eventChannelId = String(metadata?.channelId ?? "");
                        const eventUserId = String(payload.userId ?? "");
                        const eventUserName = String(metadata?.userName ?? "");
                        const eventUpdatedAt = String(
                            payload.$updatedAt ?? payload.updatedAt ?? "",
                        );

                        if (eventChannelId !== contextId) return;
                        if (eventUserId === currentUserId || eventUserId === "")
                            return;

                        const events = response.events ?? [];
                        const isDelete = events.some((e: string) =>
                            e.endsWith(".delete"),
                        );

                        const needsEnrich = !eventUserName && !isDelete;
                        setTypingUsers((prev) => {
                            const next = { ...prev };
                            if (isDelete) {
                                delete next[eventUserId];
                            } else {
                                next[eventUserId] = {
                                    userId: eventUserId,
                                    userName: eventUserName || undefined,
                                    updatedAt: eventUpdatedAt,
                                };
                            }
                            return next;
                        });
                        if (needsEnrich) {
                            void enrichProfiles([eventUserId]);
                        }
                    },
                ).then((handle) => {
                    if (cancelled || generation !== currentGeneration) {
                        void handle.unsubscribe();
                    } else {
                        subHandle = handle;
                    }
                }).catch(() => {
                    // realtime subscription is best-effort
                });
            } catch {
                // realtime subscription is best-effort
            }
        };

        const doUnsubscribe = () => {
            generation += 1;
            if (subHandle) {
                try {
                    void subHandle.unsubscribe();
                } catch {}
                subHandle = undefined;
            }
            if (realtimeInstance) {
                try {
                    void realtimeInstance.disconnect();
                } catch {}
                realtimeInstance = undefined;
            }
        };

        doSubscribe();

        const appStateSub = AppState.addEventListener("change", (state) => {
            if (state === "background") {
                doUnsubscribe();
            } else if (state === "active") {
                doUnsubscribe();
                doSubscribe();
            }
        });

        return () => {
            cancelled = true;
            appStateSub.remove();
            doUnsubscribe();
        };
    }, [instanceUrl, accessToken, contextId, currentUserId, enrichProfiles, projectId, appwriteEndpoint]);

    // Stale typing cleanup interval - only runs while users are typing
    useEffect(() => {
        if (Object.keys(typingUsers).length === 0) return;
        const interval = setInterval(() => {
            const now = Date.now();
            setTypingUsers((prev) => {
                if (Object.keys(prev).length === 0) return prev;
                let changed = false;
                const updated: Record<string, TypingUser> = {};
                for (const [uid, info] of Object.entries(prev)) {
                    const updatedTime = new Date(info.updatedAt).getTime();
                    if (now - updatedTime > STALE_THRESHOLD_MS) {
                        changed = true;
                    } else {
                        updated[uid] = info;
                    }
                }
                return changed ? updated : prev;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [typingUsers]);

    // Cleanup typing presence on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current)
                clearTimeout(typingTimeoutRef.current);
            if (typingDebounceRef.current)
                clearTimeout(typingDebounceRef.current);
            if (typingPresenceCreatedRef.current) {
                void sendTypingPresence(false);
            }
        };
    }, [sendTypingPresence]);

    const otherTypingUsers = Object.values(typingUsers).filter(
        (u) => u.userId !== currentUserId,
    );

    return {
        typingUsers: otherTypingUsers,
        handleTypingChange,
    };
}
