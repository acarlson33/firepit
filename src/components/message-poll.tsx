"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import type { MessagePoll } from "@/lib/types";
import { Button } from "@/components/ui/button";

type MessagePollProps = {
    messageId: string;
    poll: MessagePoll;
    currentUserId: string | null;
    canClose?: boolean;
    readOnly?: boolean;
    onVote?: (optionId: string) => Promise<MessagePoll | void>;
    onClose?: () => Promise<MessagePoll | void>;
};

export function MessagePollBlock({
    messageId,
    poll,
    currentUserId,
    canClose = false,
    readOnly = false,
    onVote,
    onClose,
}: MessagePollProps) {
    const [localPollState, setLocalPollState] = useState<MessagePoll | null>(
        null,
    );
    const [submittingVote, setSubmittingVote] = useState<string | null>(null);
    const [closing, setClosing] = useState(false);
    const pollStateKey = useMemo(
        () =>
            `${poll.id}:${poll.status}:${poll.closedAt ?? ""}:${poll.closedBy ?? ""}:${poll.options
                .map(
                    (option) =>
                        `${option.id}:${option.count}:${[...option.voterIds]
                            .sort()
                            .join(",")}`,
                )
                .join("|")}`,
        [
            poll.closedAt,
            poll.closedBy,
            poll.id,
            poll.options,
            poll.status,
        ],
    );

    useEffect(() => {
        setLocalPollState(null);
    }, [pollStateKey]);

    const pollState = localPollState ?? poll;

    const selectedOptionId = useMemo(() => {
        if (!currentUserId) {
            return null;
        }

        return (
            pollState.options.find((option) =>
                option.voterIds.includes(currentUserId),
            )?.id ?? null
        );
    }, [currentUserId, pollState.options]);

    const pollClosed = pollState.status === "closed";

    async function vote(optionId: string) {
        if (!currentUserId || readOnly || pollClosed || submittingVote) {
            return;
        }

        setSubmittingVote(optionId);
        try {
            if (onVote) {
                const updatedPoll = await onVote(optionId);
                if (updatedPoll) {
                    setLocalPollState(updatedPoll);
                }
                return;
            }

            const response = await fetch(
                `/api/messages/${messageId}/poll-votes`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ optionId }),
                },
            );

            const payload = (await response.json()) as {
                error?: string;
                poll?: MessagePoll;
            };

            if (!response.ok || !payload.poll) {
                throw new Error(payload.error || "Failed to cast vote.");
            }

            setLocalPollState(payload.poll);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to cast vote.",
            );
        } finally {
            setSubmittingVote(null);
        }
    }

    async function closePoll() {
        if (!canClose || pollClosed || closing) {
            return;
        }

        setClosing(true);
        try {
            if (onClose) {
                const updatedPoll = await onClose();
                if (updatedPoll) {
                    setLocalPollState(updatedPoll);
                }
                return;
            }

            const response = await fetch(`/api/messages/${messageId}/poll/close`, {
                method: "POST",
            });

            const payload = (await response.json()) as {
                error?: string;
                poll?: MessagePoll;
            };

            if (!response.ok || !payload.poll) {
                throw new Error(payload.error || "Failed to close poll.");
            }

            setLocalPollState(payload.poll);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to close poll.",
            );
        } finally {
            setClosing(false);
        }
    }

    return (
        <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{pollState.question}</p>
                {pollClosed ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Closed
                    </span>
                ) : null}
            </div>

            <div className="mt-2 space-y-2">
                {pollState.options.map((option) => {
                    const isSelected = selectedOptionId === option.id;
                    const isLoading = submittingVote === option.id;
                    const voteLocked = Boolean(submittingVote);

                    return (
                        <Button
                            className="h-auto w-full justify-between gap-3 py-2 text-left"
                            disabled={readOnly || pollClosed || voteLocked}
                            key={option.id}
                            onClick={() => {
                                void vote(option.id);
                            }}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                        >
                            <span className="truncate text-sm">{option.text}</span>
                            <span className="inline-flex items-center gap-1 text-xs">
                                {isLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : null}
                                {option.count}
                            </span>
                        </Button>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    {pollState.options.reduce(
                        (total, option) => total + option.count,
                        0,
                    )} votes
                </span>

                <div className="flex items-center gap-2">
                    {readOnly && !pollClosed ? (
                        <span className="inline-flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            Read-only
                        </span>
                    ) : null}
                    {canClose && !pollClosed ? (
                        <Button
                            aria-label="Close poll"
                            disabled={closing}
                            onClick={() => {
                                void closePoll();
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            {closing ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Closing...
                                </>
                            ) : (
                                "Close poll"
                            )}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
