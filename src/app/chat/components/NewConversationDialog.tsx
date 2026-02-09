"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, User, Users, X } from "lucide-react";
import Image from "next/image";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    createGroupConversation,
    getOrCreateConversation,
    uploadImage,
} from "@/lib/appwrite-dms-client";
import type { Conversation } from "@/lib/types";

type UserSearchResult = {
    userId: string;
    displayName?: string;
    pronouns?: string;
    avatarUrl?: string;
};

type NewConversationDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentUserId: string;
    onConversationCreated: (conversation: Conversation) => void;
};

export function NewConversationDialog({
    open,
    onOpenChange,
    currentUserId,
    onConversationCreated,
}: NewConversationDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
    const [groupName, setGroupName] = useState("");
    const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
    const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(
        null,
    );
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isGroup = selectedUsers.length >= 2;
    const actionLabel = isGroup ? "Create Group DM" : "Start Conversation";
    const actionDisabled =
        loading ||
        uploadingAvatar ||
        selectedUsers.length === 0 ||
        (isGroup && groupName.trim().length === 0);

    // Search for users as user types
    useEffect(() => {
        if (!open) {
            return;
        }

        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            searchUsers(searchQuery).catch(() => undefined);
        }, 300);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchQuery, open]);

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setSearchQuery("");
            setSearchResults([]);
            setSelectedUsers([]);
            setGroupName("");
            setError(null);
            setGroupAvatar(null);
            setGroupAvatarPreview(null);
        }
    }, [open]);

    useEffect(() => {
        return () => {
            if (groupAvatarPreview) {
                URL.revokeObjectURL(groupAvatarPreview);
            }
        };
    }, [groupAvatarPreview]);

    const searchUsers = async (query: string) => {
        setSearching(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/users/search?q=${encodeURIComponent(query)}`,
            );

            if (!response.ok) {
                throw new Error("Failed to search users");
            }

            const data = await response.json();

            // Filter out current user from results
            const filteredUsers = data.users.filter(
                (user: UserSearchResult) => user.userId !== currentUserId,
            );

            setSearchResults(filteredUsers);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to search users",
            );
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handleToggleUser = (user: UserSearchResult) => {
        setSelectedUsers((prev) => {
            const exists = prev.some((u) => u.userId === user.userId);
            if (exists) {
                return prev.filter((u) => u.userId !== user.userId);
            }
            return [...prev, user];
        });
        setSearchQuery("");
        setSearchResults([]);
        setError(null);
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers((prev) =>
            prev.filter((user) => user.userId !== userId),
        );
    };

    const handleAvatarChange = (file: File | null) => {
        setGroupAvatar(file);
        if (groupAvatarPreview) {
            URL.revokeObjectURL(groupAvatarPreview);
        }
        setGroupAvatarPreview(file ? URL.createObjectURL(file) : null);
    };

    const handleCreate = async () => {
        if (selectedUsers.length === 0) {
            setError("Select at least one recipient");
            return;
        }

        const uniqueUserIds = Array.from(
            new Set(selectedUsers.map((user) => user.userId)),
        );
        const isGroup = uniqueUserIds.length >= 2;
        if (isGroup && groupName.trim().length === 0) {
            setError("Add a name for your group DM");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            let avatarUrl: string | undefined;
            if (isGroup && groupAvatar) {
                setUploadingAvatar(true);
                const upload = await uploadImage(groupAvatar);
                avatarUrl = upload.url;
            }

            const participantIds = [currentUserId, ...uniqueUserIds];
            const conversation = isGroup
                ? await createGroupConversation(participantIds, {
                      name: groupName.trim(),
                      avatarUrl,
                  })
                : await getOrCreateConversation(
                      currentUserId,
                      uniqueUserIds[0],
                  );

            onConversationCreated(conversation);
            onOpenChange(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create conversation",
            );
        } finally {
            setUploadingAvatar(false);
            setLoading(false);
        }
    };

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Start a Conversation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm" htmlFor="userSearch">
                            Search by name or user ID
                        </label>
                        <div className="relative">
                            <div className="relative flex-1">
                                <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                                <Input
                                    id="userSearch"
                                    className="pl-9"
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="Type to search..."
                                    value={searchQuery}
                                    autoComplete="off"
                                />
                                {searching && (
                                    <Loader2 className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground" />
                                )}
                            </div>

                            {searchResults.length > 0 && (
                                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                                    <div className="max-h-60 overflow-y-auto p-1">
                                        {searchResults.map((user) => {
                                            const selected = selectedUsers.some(
                                                (selectedUser) =>
                                                    selectedUser.userId ===
                                                    user.userId,
                                            );
                                            return (
                                                <button
                                                    className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors ${selected ? "bg-accent" : "hover:bg-accent"}`}
                                                    key={user.userId}
                                                    onClick={() =>
                                                        handleToggleUser(user)
                                                    }
                                                    type="button"
                                                    aria-pressed={selected}
                                                >
                                                    {user.avatarUrl ? (
                                                        <div className="relative size-8 overflow-hidden rounded-full">
                                                            <Image
                                                                alt={
                                                                    user.displayName ||
                                                                    user.userId
                                                                }
                                                                className="object-cover"
                                                                fill
                                                                sizes="32px"
                                                                src={
                                                                    user.avatarUrl
                                                                }
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                                                            <User className="size-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="truncate font-medium text-sm">
                                                            {user.displayName ||
                                                                user.userId}
                                                        </p>
                                                        {user.displayName && (
                                                            <p className="truncate text-muted-foreground text-xs">
                                                                {user.userId}
                                                            </p>
                                                        )}
                                                        {user.pronouns && (
                                                            <p className="truncate text-muted-foreground text-xs italic">
                                                                {user.pronouns}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex size-6 items-center justify-center rounded-full border border-border bg-background">
                                                        {selected ? (
                                                            <Users className="size-3" />
                                                        ) : (
                                                            <User className="size-3" />
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {!searching &&
                                searchQuery.length >= 2 &&
                                searchResults.length === 0 && (
                                    <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover p-4 text-center shadow-md">
                                        <p className="text-muted-foreground text-sm">
                                            No users found matching &quot;
                                            {searchQuery}&quot;
                                        </p>
                                    </div>
                                )}
                        </div>

                        {error && (
                            <p className="text-destructive text-sm">{error}</p>
                        )}

                        {selectedUsers.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                    <Users className="size-4" />
                                    <span>
                                        {selectedUsers.length} recipient
                                        {selectedUsers.length === 1
                                            ? ""
                                            : "s"}{" "}
                                        selected
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedUsers.map((user) => (
                                        <span
                                            className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm"
                                            key={user.userId}
                                        >
                                            <span className="max-w-32 truncate">
                                                {user.displayName ||
                                                    user.userId}
                                            </span>
                                            <button
                                                className="rounded-full p-1 text-muted-foreground hover:bg-accent"
                                                onClick={() =>
                                                    handleRemoveUser(
                                                        user.userId,
                                                    )
                                                }
                                                type="button"
                                            >
                                                <X className="size-3" />
                                                <span className="sr-only">
                                                    Remove{" "}
                                                    {user.displayName ||
                                                        user.userId}
                                                </span>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {isGroup && (
                        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                            <div className="space-y-1">
                                <label className="text-sm" htmlFor="groupName">
                                    Group name
                                </label>
                                <Input
                                    id="groupName"
                                    onChange={(event) =>
                                        setGroupName(event.target.value)
                                    }
                                    placeholder="Team chat"
                                    value={groupName}
                                />
                            </div>
                            <div className="space-y-1">
                                <label
                                    className="text-sm"
                                    htmlFor="groupAvatar"
                                >
                                    Group avatar (optional)
                                </label>
                                <div className="flex items-center gap-3">
                                    {groupAvatarPreview ? (
                                        <div className="relative size-12 overflow-hidden rounded-full">
                                            <Image
                                                alt={
                                                    groupName || "Group avatar"
                                                }
                                                className="object-cover"
                                                fill
                                                sizes="48px"
                                                src={groupAvatarPreview}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                            <User className="size-5 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="flex flex-1 items-center gap-2">
                                        <Input
                                            accept="image/*"
                                            id="groupAvatar"
                                            onChange={(event) =>
                                                handleAvatarChange(
                                                    event.target.files?.[0] ??
                                                        null,
                                                )
                                            }
                                            type="file"
                                        />
                                        {groupAvatar && (
                                            <Button
                                                onClick={() =>
                                                    handleAvatarChange(null)
                                                }
                                                size="sm"
                                                type="button"
                                                variant="secondary"
                                            >
                                                <X className="mr-2 size-4" />
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <Button
                        className="w-full"
                        disabled={actionDisabled}
                        onClick={handleCreate}
                        type="button"
                    >
                        {loading || uploadingAvatar ? (
                            <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                {isGroup
                                    ? "Creating group..."
                                    : "Starting conversation..."}
                            </>
                        ) : (
                            actionLabel
                        )}
                    </Button>

                    <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-muted-foreground text-sm">
                            <strong>Tip:</strong> Search by display name (e.g.,
                            &quot;John Doe&quot;) or user ID to find someone to
                            message.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
