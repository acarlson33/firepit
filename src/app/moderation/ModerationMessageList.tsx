"use client";

import { Channel } from "appwrite";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { logger } from "@/lib/client-logger";
import { getSharedRealtime } from "@/lib/realtime-pool";
import type { FileAttachment } from "@/lib/types";
import {
    actionHardDeleteBound,
    actionRestoreBound,
    actionSoftDeleteBound,
} from "./actions";

type ModerationMessage = {
    $id: string;
    attachments?: FileAttachment[];
    imageUrl?: string;
    removedAt?: string;
    removedBy?: string;
    serverId?: string;
    channelId?: string;
    text?: string;
    userId?: string;
    userName?: string;
    mentions?: string[];
    senderDisplay?: string;
    serverDisplay?: string;
    channelDisplay?: string;
    removedByDisplay?: string;
};

type Props = {
    initialMessages: ModerationMessage[];
    badgeMap: Record<string, string[]>;
    isAdmin: boolean;
};

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
    return (
        value === undefined ||
        (Array.isArray(value) &&
            value.every((entry) => typeof entry === "string"))
    );
}

function isFileAttachment(value: unknown): value is FileAttachment {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.fileId === "string" &&
        typeof candidate.fileName === "string" &&
        typeof candidate.fileSize === "number" &&
        Number.isFinite(candidate.fileSize) &&
        typeof candidate.fileType === "string" &&
        typeof candidate.fileUrl === "string" &&
        (candidate.thumbnailUrl === undefined ||
            typeof candidate.thumbnailUrl === "string")
    );
}

function isOptionalFileAttachmentArray(
    value: unknown,
): value is FileAttachment[] | undefined {
    return (
        value === undefined ||
        (Array.isArray(value) &&
            value.every((entry) => isFileAttachment(entry)))
    );
}

function isModerationMessagePayload(
    payload: unknown,
): payload is ModerationMessage {
    if (!payload || typeof payload !== "object") {
        return false;
    }

    const candidate = payload as Record<string, unknown>;
    return (
        typeof candidate.$id === "string" &&
        isOptionalFileAttachmentArray(candidate.attachments) &&
        isOptionalString(candidate.channelDisplay) &&
        isOptionalString(candidate.channelId) &&
        isOptionalString(candidate.imageUrl) &&
        isOptionalStringArray(candidate.mentions) &&
        isOptionalString(candidate.removedAt) &&
        isOptionalString(candidate.removedBy) &&
        isOptionalString(candidate.removedByDisplay) &&
        isOptionalString(candidate.senderDisplay) &&
        isOptionalString(candidate.serverDisplay) &&
        isOptionalString(candidate.serverId) &&
        isOptionalString(candidate.text) &&
        isOptionalString(candidate.userId) &&
        isOptionalString(candidate.userName)
    );
}

// Action buttons for each message
function ActionButtons({
    message,
    isAdmin,
    onHardDelete,
    onRestore,
    onSoftDelete,
}: {
    message: { $id: string; removedAt?: string };
    isAdmin: boolean;
    onHardDelete: (messageId: string) => void;
    onRestore: (messageId: string) => void;
    onSoftDelete: (messageId: string) => void;
}) {
    const removed = Boolean(message.removedAt);
    const [isPending, startTransition] = useTransition();
    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <button
                    className="rounded-md bg-destructive px-3 py-1.5 text-destructive-foreground text-sm font-medium transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={removed || isPending}
                    onClick={() =>
                        startTransition(() => {
                            void onSoftDelete(message.$id);
                        })
                    }
                    type="button"
                >
                    Remove
                </button>
                <button
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!removed || isPending}
                    onClick={() =>
                        startTransition(() => {
                            void onRestore(message.$id);
                        })
                    }
                    type="button"
                >
                    Restore
                </button>
            </div>
            {isAdmin && (
                <button
                    className="w-full rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-destructive text-xs font-medium transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isPending}
                    onClick={() =>
                        startTransition(() => {
                            void onHardDelete(message.$id);
                        })
                    }
                    type="button"
                >
                    Permanently Delete (Admin)
                </button>
            )}
        </div>
    );
}

export function ModerationMessageList({
    initialMessages,
    badgeMap,
    isAdmin,
}: Props) {
    const [messages, setMessages] = useState(initialMessages);
    const router = useRouter();
    const { customEmojis } = useCustomEmojis();

    useEffect(() => {
        // Subscribe to real-time updates for the messages collection
        const realtime = getSharedRealtime();
        const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
        const messagesCollectionId =
            process.env.NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID;

        if (!databaseId || !messagesCollectionId) {
            return;
        }

        let cleanup = () => {};
        let cancelled = false;

        (async () => {
            let subscription: { close: () => Promise<void> } | undefined;
            try {
                subscription = await realtime.subscribe(
                    Channel.database(databaseId)
                        .collection(messagesCollectionId)
                        .document(),
                    (response: { events: string[]; payload: unknown }) => {
                        if (cancelled) {
                            return;
                        }

                        const events = Array.isArray(response.events)
                            ? response.events
                            : [];
                        if (events.length === 0) {
                            return;
                        }

                        if (!isModerationMessagePayload(response.payload)) {
                            logger.warn(
                                "Ignoring malformed moderation realtime payload",
                                {
                                    events,
                                },
                            );
                            return;
                        }

                        const payload = response.payload;

                        const hasUpdateEvent = events.some((event) =>
                            event.includes(".update"),
                        );
                        const hasDeleteEvent = events.some((event) =>
                            event.includes(".delete"),
                        );
                        const hasCreateEvent = events.some((event) =>
                            event.includes(".create"),
                        );

                        if (hasUpdateEvent) {
                            // Update existing message
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.$id === payload.$id
                                        ? { ...m, ...payload }
                                        : m,
                                ),
                            );
                        } else if (hasDeleteEvent) {
                            // Remove deleted message
                            setMessages((prev) =>
                                prev.filter((m) => m.$id !== payload.$id),
                            );
                        } else if (hasCreateEvent) {
                            // Add new message at the top if it does not already exist
                            setMessages((prev) =>
                                prev.some((m) => m.$id === payload.$id)
                                    ? prev
                                    : [payload, ...prev],
                            );
                        }
                    },
                );

                if (cancelled) {
                    await subscription.close().catch((closeError) => {
                        logger.warn(
                            "Failed to close moderation realtime subscription during cancellation",
                            {
                                error:
                                    closeError instanceof Error
                                        ? closeError.message
                                        : String(closeError),
                            },
                        );
                    });
                    return;
                }

                cleanup = () => {
                    subscription?.close().catch((closeError) => {
                        logger.warn(
                            "Failed to close moderation realtime subscription during cleanup",
                            {
                                error:
                                    closeError instanceof Error
                                        ? closeError.message
                                        : String(closeError),
                            },
                        );
                    });
                };
            } catch (error) {
                if (subscription) {
                    await subscription.close().catch((closeError) => {
                        logger.warn(
                            "Failed to close moderation realtime subscription after subscribe error",
                            {
                                error:
                                    closeError instanceof Error
                                        ? closeError.message
                                        : String(closeError),
                            },
                        );
                    });
                }
                logger.error(
                    "Moderation realtime subscription failed:",
                    error instanceof Error ? error : String(error),
                );
                cleanup = () => {};
            }
        })().catch((setupError) => {
            logger.error(
                "Moderation realtime subscription setup failed:",
                setupError instanceof Error ? setupError : String(setupError),
            );
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, []);

    // Update when initial messages change (e.g., filter applied)
    useEffect(() => {
        setMessages(initialMessages);
    }, [initialMessages]);

    async function runAction(action: () => Promise<void>) {
        await action();
        router.refresh();
    }

    function buildFormData(messageId: string) {
        const formData = new FormData();
        formData.set("messageId", messageId);
        return formData;
    }

    async function handleSoftDelete(messageId: string) {
        let previousMessages: ModerationMessage[] = [];
        setMessages((prev) => {
            previousMessages = prev;
            return prev.map((message) =>
                message.$id === messageId
                    ? {
                          ...message,
                          removedAt: new Date().toISOString(),
                      }
                    : message,
            );
        });
        try {
            await runAction(() =>
                actionSoftDeleteBound(buildFormData(messageId)),
            );
        } catch {
            setMessages(previousMessages);
            router.refresh();
        }
    }

    async function handleRestore(messageId: string) {
        let previousMessages: ModerationMessage[] = [];
        setMessages((prev) => {
            previousMessages = prev;
            return prev.map((message) =>
                message.$id === messageId
                    ? {
                          ...message,
                          removedAt: undefined,
                          removedBy: undefined,
                      }
                    : message,
            );
        });
        try {
            await runAction(() => actionRestoreBound(buildFormData(messageId)));
        } catch {
            setMessages(previousMessages);
            router.refresh();
        }
    }

    async function handleHardDelete(messageId: string) {
        let previousMessages: ModerationMessage[] = [];
        setMessages((prev) => {
            previousMessages = prev;
            return prev.filter((message) => message.$id !== messageId);
        });
        try {
            await runAction(() =>
                actionHardDeleteBound(buildFormData(messageId)),
            );
        } catch {
            setMessages(previousMessages);
            router.refresh();
        }
    }

    if (messages.length === 0) {
        return (
            <div className="rounded border p-8 text-center text-muted-foreground">
                <p>No messages found.</p>
            </div>
        );
    }

    function getImageAttachments(attachments?: FileAttachment[]) {
        if (!attachments || attachments.length === 0) {
            return [];
        }

        return attachments.filter((attachment) => {
            if (typeof attachment.fileType !== "string") {
                return false;
            }

            return attachment.fileType
                .trim()
                .toLowerCase()
                .startsWith("image/");
        });
    }

    return (
        <div className="space-y-3">
            {messages.map((m) => {
                const removed = Boolean(m.removedAt);
                const authorBadges = badgeMap[m.userId || ""] || [];
                const removerBadges = badgeMap[m.removedBy || ""] || [];
                const imageAttachments = getImageAttachments(m.attachments);

                return (
                    <div
                        className={`rounded-lg border bg-card p-4 shadow-sm transition-all ${removed ? "border-destructive/50 bg-destructive/5" : ""}`}
                        key={m.$id}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-2">
                                {/* Server/Channel Info */}
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                    <span className="font-medium">
                                        {m.serverDisplay || "No Server"} /{" "}
                                        {m.channelDisplay || "No Channel"}
                                    </span>
                                    {removed && (
                                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
                                            Removed
                                        </span>
                                    )}
                                </div>

                                {/* Message Text */}
                                <p className="wrap-break-word text-sm leading-relaxed">
                                    {m.text ? (
                                        <MessageWithMentions
                                            text={m.text}
                                            mentions={m.mentions}
                                            currentUserId=""
                                            customEmojis={customEmojis}
                                        />
                                    ) : null}
                                </p>

                                {m.imageUrl ? (
                                    <a
                                        className="block max-w-md overflow-hidden rounded-xl border border-border/60 bg-background/70 transition-opacity hover:opacity-90"
                                        href={m.imageUrl}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >
                                        <ImageWithSkeleton
                                            alt={`Moderation preview for message ${m.$id}`}
                                            className="max-h-72 w-full object-contain"
                                            src={m.imageUrl}
                                        />
                                    </a>
                                ) : null}

                                {imageAttachments.length > 0 ? (
                                    <div className="flex flex-wrap gap-3">
                                        {imageAttachments.map((attachment) => (
                                            <a
                                                className="block max-w-md overflow-hidden rounded-xl border border-border/60 bg-background/70 transition-opacity hover:opacity-90"
                                                href={attachment.fileUrl}
                                                key={`${m.$id}-${attachment.fileId}`}
                                                rel="noopener noreferrer"
                                                target="_blank"
                                            >
                                                <ImageWithSkeleton
                                                    alt={`Moderation attachment preview for ${attachment.fileName}`}
                                                    className="max-h-72 w-full object-contain"
                                                    src={attachment.fileUrl}
                                                />
                                            </a>
                                        ))}
                                    </div>
                                ) : null}

                                {/* Author and Metadata */}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">
                                        User:{" "}
                                        <span>
                                            {m.senderDisplay ||
                                                m.userName ||
                                                m.userId?.slice(0, 8)}
                                        </span>
                                    </span>
                                    {authorBadges.map((b) => (
                                        <span
                                            className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-medium"
                                            key={b}
                                        >
                                            {b}
                                        </span>
                                    ))}
                                    {removed && m.removedAt && (
                                        <>
                                            <span className="text-muted-foreground">
                                                •
                                            </span>
                                            <span className="text-muted-foreground">
                                                Removed:{" "}
                                                {new Date(
                                                    m.removedAt,
                                                ).toLocaleString()}
                                            </span>
                                        </>
                                    )}
                                    {removed && m.removedBy && (
                                        <>
                                            <span className="text-muted-foreground">
                                                •
                                            </span>
                                            <span className="text-muted-foreground">
                                                By:{" "}
                                                <span>
                                                    {m.removedByDisplay ||
                                                        m.removedBy.slice(0, 8)}
                                                </span>
                                                {removerBadges.map((b) => (
                                                    <span
                                                        className="ml-1 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-medium"
                                                        key={b}
                                                    >
                                                        {b}
                                                    </span>
                                                ))}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Message ID (smaller, less prominent) */}
                                <div className="text-muted-foreground/70 text-[10px]">
                                    ID:{" "}
                                    <span className="font-mono">{m.$id}</span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <ActionButtons
                                isAdmin={isAdmin}
                                message={m}
                                onHardDelete={handleHardDelete}
                                onRestore={handleRestore}
                                onSoftDelete={handleSoftDelete}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
