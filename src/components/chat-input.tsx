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

type ChatInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    /** Called whenever the set of autocompleted mention display names changes */
    onMentionsChange?: (names: string[]) => void;
};

export function ChatInput({
    value,
    onChange,
    placeholder = "Type a message",
    disabled = false,
    className = "",
    "aria-label": ariaLabel = "Message",
    onKeyDown,
    onMentionsChange,
}: ChatInputProps) {
    const [showMentionAutocomplete, setShowMentionAutocomplete] =
        useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [autocompletePosition, setAutocompletePosition] = useState({
        top: 0,
        left: 0,
    });
    const [availableUsers, setAvailableUsers] = useState<UserProfileData[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const mentionedNamesRef = useRef<string[]>([]);

    // Fetch users when mention query changes
    useEffect(() => {
        if (!showMentionAutocomplete) {
            setAvailableUsers([]);
            setIsLoadingUsers(false);
            return;
        }

        // Show loading immediately when autocomplete is shown
        setIsLoadingUsers(true);

        // If query is empty, fetch all users
        const fetchUsers = async () => {
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
            } catch (error) {
                console.error("Failed to fetch users:", error);
                setAvailableUsers([]);
            } finally {
                setIsLoadingUsers(false);
            }
        };

        const debounce = setTimeout(() => {
            void fetchUsers();
        }, 150);

        return () => clearTimeout(debounce);
    }, [mentionQuery, showMentionAutocomplete]);

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
        (user: UserProfileData) => {
            const cursorPosition = inputRef.current?.selectionStart || 0;
            const username = user.displayName || user.userId;
            const result = replaceMentionAtCursor(
                value,
                cursorPosition,
                username,
            );
            onChange(result.newText);
            setShowMentionAutocomplete(false);
            setMentionQuery("");
            setAvailableUsers([]);

            // Track the selected display name for accurate mention extraction
            if (!mentionedNamesRef.current.includes(username)) {
                mentionedNamesRef.current = [
                    ...mentionedNamesRef.current,
                    username,
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
                    position={autocompletePosition}
                    onSelect={handleMentionSelect}
                    onClose={() => {
                        setShowMentionAutocomplete(false);
                        setMentionQuery("");
                        setAvailableUsers([]);
                    }}
                    isLoading={isLoadingUsers}
                />
            )}
        </>
    );
}
