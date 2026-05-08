"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { AtSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MentionAutocomplete } from "@/components/mention-autocomplete";
import {
    getMentionAtCursor,
    replaceMentionAtCursor,
} from "@/lib/mention-utils";
import type { UserProfileData } from "@/lib/types";

export type MentionableRole = {
    id: string;
    name: string;
    color: string;
    mentionable: boolean;
    memberCount: number;
};

type ChatInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
    /** Called whenever the set of autocompleted mention display names changes */
    onMentionsChange?: (names: string[]) => void;
    /** Server ID for fetching mentionable roles (optional) */
    serverId?: string;
    /** User's permission to mention everyone (optional) */
    canMentionEveryone?: boolean;
};

export function ChatInput({
    value,
    onChange,
    placeholder = "Type a message",
    disabled = false,
    className = "",
    "aria-label": ariaLabel = "Message",
    onKeyDown,
    onPaste,
    onMentionsChange,
    serverId,
    canMentionEveryone,
}: ChatInputProps) {
    const [showMentionAutocomplete, setShowMentionAutocomplete] =
        useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [autocompletePosition, setAutocompletePosition] = useState({
        top: 0,
        left: 0,
    });
    const [availableUsers, setAvailableUsers] = useState<UserProfileData[]>([]);
    const [mentionableRoles, setMentionableRoles] = useState<MentionableRole[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const mentionedNamesRef = useRef<string[]>([]);

    // Fetch users and mentionable roles when mention query changes
    useEffect(() => {
        if (!showMentionAutocomplete) {
            setAvailableUsers([]);
            setMentionableRoles([]);
            setIsLoadingUsers(false);
            return;
        }

        // Show loading immediately when autocomplete is shown
        setIsLoadingUsers(true);

        // If query is empty, fetch all users
        const fetchUsersAndRoles = async () => {
            try {
                const query = mentionQuery || "";
                const response = await fetch(
                    `/api/users/search?q=${encodeURIComponent(query)}&limit=10`,
                );
                if (response.ok) {
                    const data = await response.json();
                    setAvailableUsers(data.users || []);
                } else {
                    setAvailableUsers([]);
                }

                // Fetch mentionable roles if we have a serverId
                if (serverId && (query === "" || query.toLowerCase().includes("all"))) {
                    try {
                        const rolesResponse = await fetch(
                            `/api/servers/${serverId}/mentionable-roles`,
                        );
                        if (rolesResponse.ok) {
                            const rolesData = await rolesResponse.json();
                            setMentionableRoles(rolesData.roles || []);
                        }
                    } catch (error) {
                        console.error("Failed to fetch mentionable roles:", error);
                    }
                } else {
                    setMentionableRoles([]);
                }
            } catch (error) {
                console.error("Failed to fetch users:", error);
                setAvailableUsers([]);
            } finally {
                setIsLoadingUsers(false);
            }
        };

        const debounce = setTimeout(() => {
            void fetchUsersAndRoles();
        }, 150);

        return () => clearTimeout(debounce);
    }, [mentionQuery, showMentionAutocomplete, serverId]);

    // Update position on scroll/resize
    useEffect(() => {
        if (!showMentionAutocomplete) {
            return;
        }

        const updatePosition = () => {
            if (inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect();
                setAutocompletePosition({
                    top: rect.top - 8,
                    left: rect.left,
                });
            }
        };

        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);

        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [showMentionAutocomplete]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value;
            const cursorPosition = e.target.selectionStart || 0;

            onChange(newValue);

            // Reset tracked mentions when input is cleared (e.g. after send)
            if (!newValue.trim()) {
                mentionedNamesRef.current = [];
                onMentionsChange?.([]);
            }

            // Check for @ mention
            const mention = getMentionAtCursor(newValue, cursorPosition);

            if (mention) {
                setMentionQuery(mention.username);
                setShowMentionAutocomplete(true);

                // Calculate position for autocomplete (fixed positioning)
                // Position it slightly above the input
                if (inputRef.current) {
                    const rect = inputRef.current.getBoundingClientRect();
                    setAutocompletePosition({
                        top: rect.top - 8, // Just above the input with small gap
                        left: rect.left,
                    });
                }
            } else {
                setShowMentionAutocomplete(false);
                setMentionQuery("");
                setAvailableUsers([]);
            }
        },
        [onChange],
    );

    const handleMentionSelect = useCallback(
        (selectable: UserProfileData | MentionableRole | null) => {
            const cursorPosition = inputRef.current?.selectionStart || 0;
            
            // Determine the mention text based on type
            let mentionText: string;
            if (selectable === null) {
                // @all mention
                mentionText = "all";
            } else if ("memberCount" in selectable) {
                // Role mention - use role name with special prefix
                mentionText = `role:${selectable.name}`;
            } else {
                // User mention - use display name
                mentionText = selectable.displayName || selectable.userId;
            }
            
            const result = replaceMentionAtCursor(
                value,
                cursorPosition,
                mentionText,
            );
            onChange(result.newText);
            setShowMentionAutocomplete(false);
            setMentionQuery("");
            setAvailableUsers([]);
            setMentionableRoles([]);

            // Track the selected mention for accurate mention extraction
            if (!mentionedNamesRef.current.includes(mentionText)) {
                mentionedNamesRef.current = [
                    ...mentionedNamesRef.current,
                    mentionText,
                ];
                onMentionsChange?.(mentionedNamesRef.current);
            }

            // Return focus to input and set cursor position
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(
                        result.newCursorPosition,
                        result.newCursorPosition,
                    );
                }
            }, 0);
        },
        [value, onChange, onMentionsChange],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // Let autocomplete handle its own keyboard events
            if (showMentionAutocomplete) {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    // Prevent cursor movement
                    e.preventDefault();
                    return;
                }
                if (e.key === "Enter" || e.key === "Escape") {
                    // Prevent form submission but let autocomplete handle it
                    e.preventDefault();
                    return;
                }
            }

            onKeyDown?.(e);
        },
        [showMentionAutocomplete, onKeyDown],
    );

    // Enhanced placeholder with @ mention hint
    const enhancedPlaceholder = `${placeholder} (type @ to mention)`;

    return (
        <>
            <div className="relative flex-1">
                <Input
                    ref={inputRef}
                    aria-label={ariaLabel}
                    disabled={disabled}
                    onChange={handleChange}
                    onPaste={onPaste}
                    placeholder={enhancedPlaceholder}
                    value={value}
                    className={className}
                    onKeyDown={handleKeyDown}
                />
                {showMentionAutocomplete && (
                    <div className="absolute -bottom-6 left-0 flex items-center gap-1 text-xs text-muted-foreground">
                        <AtSign className="size-3" />
                        <span>
                            Mentioning... (↑↓ to navigate, Enter to select, Esc
                            to cancel)
                        </span>
                    </div>
                )}
            </div>
            {showMentionAutocomplete && (
                <MentionAutocomplete
                    query={mentionQuery}
                    users={availableUsers}
                    roles={mentionableRoles}
                    position={autocompletePosition}
                    onSelect={handleMentionSelect}
                    onClose={() => {
                        setShowMentionAutocomplete(false);
                        setMentionQuery("");
                        setAvailableUsers([]);
                        setMentionableRoles([]);
                    }}
                    isLoading={isLoadingUsers}
                    canMentionEveryone={canMentionEveryone}
                />
            )}
        </>
    );
}
