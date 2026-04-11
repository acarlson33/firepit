"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Copy,
    Trash2,
    Loader2,
    Plus,
    Clock,
    Users,
    Calendar,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/client-logger";
import { toast } from "sonner";
import type { ServerInvite } from "@/lib/types";

type InviteManagerDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    onCreateInvite: () => void;
};

function formatExpiration(expiresAt?: string | null) {
    if (!expiresAt) {
        return "Never";
    }
    const date = new Date(expiresAt);
    const now = new Date();
    const expired = date < now;
    const formatted = date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
    return expired ? `Expired ${formatted}` : formatted;
}

function formatUses(invite: ServerInvite) {
    if (invite.maxUses === null) {
        return `${String(invite.currentUses)} uses`;
    }
    return `${String(invite.currentUses)}/${String(invite.maxUses)} uses`;
}

function isExpired(invite: ServerInvite) {
    if (!invite.expiresAt) {
        return false;
    }
    return new Date(invite.expiresAt) < new Date();
}

function isMaxedOut(invite: ServerInvite) {
    if (invite.maxUses === null) {
        return false;
    }
    return invite.currentUses >= invite.maxUses;
}

function isInactive(invite: ServerInvite) {
    return isExpired(invite) || isMaxedOut(invite);
}

export function InviteManagerDialog({
    open,
    onOpenChange,
    serverId,
    onCreateInvite,
}: InviteManagerDialogProps) {
    const [invites, setInvites] = useState<ServerInvite[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingCodes, setDeletingCodes] = useState<Set<string>>(
        () => new Set(),
    );
    const isMountedRef = useRef(true);
    const loadInvitesAbortRef = useRef<AbortController | null>(null);
    const deleteInviteAbortControllersRef = useRef(
        new Map<string, AbortController>(),
    );

    const handleDialogOpenChange = useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen && deleteInviteAbortControllersRef.current.size > 0) {
                toast.info("Please wait for invite deletions to finish.");
                return;
            }

            onOpenChange(nextOpen);
        },
        [onOpenChange],
    );

    const getResponseErrorMessage = useCallback(
        async (response: Response, fallbackMessage: string) => {
            const statusPrefix = `${fallbackMessage} (status ${response.status})`;

            try {
                const body = (await response.clone().json()) as {
                    error?: string;
                    message?: string;
                };
                const message = body.error ?? body.message;
                if (message) {
                    return `${statusPrefix}: ${message}`;
                }
            } catch {
                // Fall through to text parsing.
            }

            try {
                const text = (await response.clone().text()).trim();
                if (text) {
                    return `${statusPrefix}: ${text}`;
                }
            } catch {
                // Fall through to generic message.
            }

            return statusPrefix;
        },
        [],
    );

    const loadInvites = useCallback(async () => {
        loadInvitesAbortRef.current?.abort();
        const controller = new AbortController();
        loadInvitesAbortRef.current = controller;

        setLoading(true);
        try {
            const response = await fetch(`/api/servers/${serverId}/invites`, {
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(
                    await getResponseErrorMessage(
                        response,
                        "Failed to load invites",
                    ),
                );
            }
            const data: ServerInvite[] = await response.json();

            if (controller.signal.aborted) {
                return false;
            }

            setInvites(data);
            return true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return false;
            }

            logger.error(
                "Failed to load invites",
                error instanceof Error ? error : String(error),
                { serverId },
            );
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load invites",
            );
            return false;
        } finally {
            if (
                isMountedRef.current &&
                loadInvitesAbortRef.current === controller
            ) {
                loadInvitesAbortRef.current = null;
                setLoading(false);
            }
        }
    }, [getResponseErrorMessage, serverId]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            loadInvitesAbortRef.current?.abort();
            loadInvitesAbortRef.current = null;
        };
    }, []);

    // Load invites when dialog opens
    useEffect(() => {
        if (open) {
            void loadInvites();
        }

        return () => {
            loadInvitesAbortRef.current?.abort();
        };
    }, [open, loadInvites]);

    const copyInviteLink = async (code: string) => {
        const inviteUrl = `${window.location.origin}/invite/${code}`;
        try {
            await navigator.clipboard.writeText(inviteUrl);
            toast.success("Invite link copied to clipboard");
        } catch (error) {
            logger.error(
                "Failed to copy invite link",
                error instanceof Error ? error : String(error),
                { code, serverId },
            );
            toast.error("Failed to copy invite link");
        }
    };

    const deleteInvite = async (code: string) => {
        deleteInviteAbortControllersRef.current.get(code)?.abort();
        const controller = new AbortController();
        deleteInviteAbortControllersRef.current.set(code, controller);

        setDeletingCodes((previous) => {
            const next = new Set(previous);
            next.add(code);
            return next;
        });

        try {
            const response = await fetch(`/api/invites/${code}`, {
                method: "DELETE",
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    await getResponseErrorMessage(
                        response,
                        "Failed to delete invite",
                    ),
                );
            }

            toast.success("Invite successfully revoked");

            const refreshed = await loadInvites();
            if (!refreshed) {
                logger.warn("Invite deleted but invite list refresh failed", {
                    code,
                    serverId,
                });
                toast.error(
                    "Invite deleted, but failed to refresh invite list",
                );
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            logger.error(
                "Failed to delete invite",
                error instanceof Error ? error : String(error),
                { serverId, code },
            );
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete invite",
            );
        } finally {
            deleteInviteAbortControllersRef.current.delete(code);
            if (isMountedRef.current) {
                setDeletingCodes((previous) => {
                    const next = new Set(previous);
                    next.delete(code);
                    return next;
                });
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Server Invites</DialogTitle>
                    <DialogDescription>
                        Review active invite links, copy them for sharing, or
                        revoke invites you no longer need.
                    </DialogDescription>
                </DialogHeader>

                {deletingCodes.size > 0 && (
                    <p
                        aria-atomic="true"
                        aria-live="polite"
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        Deletions in progress. Please wait before closing this
                        dialog.
                    </p>
                )}

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div
                            className="flex items-center justify-center py-8"
                            role="status"
                        >
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="sr-only">Loading invites</span>
                        </div>
                    ) : invites.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">
                                No invites yet
                            </p>
                            <Button type="button" onClick={onCreateInvite}>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Invite
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {invites.map((invite) => {
                                const isDeleting = deletingCodes.has(
                                    invite.code,
                                );

                                return (
                                    <div
                                        key={invite.$id}
                                        className={`border rounded-lg p-4 ${
                                            isInactive(invite)
                                                ? "opacity-50 bg-muted/30"
                                                : ""
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                {/* Invite Code */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                                        {invite.code}
                                                    </code>
                                                    {isExpired(invite) && (
                                                        <span className="text-xs text-destructive font-medium">
                                                            Expired
                                                        </span>
                                                    )}
                                                    {isMaxedOut(invite) && (
                                                        <span className="text-xs text-destructive font-medium">
                                                            Max uses reached
                                                        </span>
                                                    )}
                                                    {invite.temporary && (
                                                        <span className="text-xs text-blue-600 font-medium">
                                                            Temporary
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Stats */}
                                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <Users
                                                            aria-hidden="true"
                                                            className="h-3.5 w-3.5"
                                                        />
                                                        <span>
                                                            {formatUses(invite)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock
                                                            aria-hidden="true"
                                                            className="h-3.5 w-3.5"
                                                        />
                                                        <span>
                                                            {formatExpiration(
                                                                invite.expiresAt,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar
                                                            aria-hidden="true"
                                                            className="h-3.5 w-3.5"
                                                        />
                                                        <span>
                                                            Created{" "}
                                                            {new Date(
                                                                invite.$createdAt,
                                                            ).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        copyInviteLink(
                                                            invite.code,
                                                        ).catch(() => {
                                                            // copyInviteLink already reports failures.
                                                        });
                                                    }}
                                                    aria-label={`Copy invite ${invite.code}`}
                                                    disabled={isInactive(
                                                        invite,
                                                    )}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        deleteInvite(
                                                            invite.code,
                                                        ).catch(() => {
                                                            // deleteInvite already reports failures.
                                                        });
                                                    }}
                                                    aria-label={`${
                                                        isDeleting
                                                            ? "Deleting"
                                                            : "Delete"
                                                    } invite ${invite.code}`}
                                                    disabled={isDeleting}
                                                >
                                                    {isDeleting ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                {!loading && invites.length > 0 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                            {invites.length} invite
                            {invites.length === 1 ? "" : "s"}
                        </p>
                        <Button type="button" onClick={onCreateInvite}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Invite
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
