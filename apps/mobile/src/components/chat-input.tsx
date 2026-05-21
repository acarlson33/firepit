import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  TextInput,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  Keyboard,
} from "react-native";
import { Input } from "@/components/ui/input";
import MentionAutocomplete from "@/components/mention-autocomplete";
import {
  getMentionAtCursor,
  replaceMentionAtCursor,
} from "@/lib/mention-utils";
import { useTheme } from "@/hooks/use-theme";

type MentionableRole = {
  readonly type: "role";
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
  onMentionsChange?: (names: string[]) => void;
  serverId?: string;
  canMentionEveryone?: boolean;
};

export function ChatInput({
  value,
  onChange,
  placeholder = "Type a message",
  disabled = false,
  onMentionsChange,
  serverId,
  canMentionEveryone,
}: ChatInputProps) {
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [mentionableRoles, setMentionableRoles] = useState<MentionableRole[]>(
    [],
  );
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: value.length,
    end: value.length,
  });
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const inputRef = useRef<TextInput | null>(null);
  const mentionedNamesRef = useRef<string[]>([]);
  const mentionableRolesCacheRef = useRef<Record<string, MentionableRole[]>>(
    {},
  );
  const mentionQueryRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!showMentionAutocomplete) {
      mentionQueryRequestRef.current?.abort();
      mentionQueryRequestRef.current = null;
      setAvailableUsers([]);
      setMentionableRoles([]);
      setIsLoadingUsers(false);
      return;
    }

    setIsLoadingUsers(true);

    const fetchUsersAndRoles = async () => {
      const controller = new AbortController();
      mentionQueryRequestRef.current?.abort();
      mentionQueryRequestRef.current = controller;
      const query = mentionQuery || "";
      const queryLower = query.toLowerCase();

      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}&limit=10`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted) setAvailableUsers(data.users || []);
        } else if (!controller.signal.aborted) {
          setAvailableUsers([]);
        }
      } catch (error) {
        if (!controller.signal.aborted) setAvailableUsers([]);
      }

      if (controller.signal.aborted) return;

      if (!serverId) {
        if (!controller.signal.aborted) setMentionableRoles([]);
        return;
      }

      try {
        let cachedRoles = mentionableRolesCacheRef.current[serverId];

        if (!cachedRoles) {
          const rolesResponse = await fetch(
            `/api/servers/${serverId}/mentionable-roles`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          if (rolesResponse.ok) {
            const rolesData = await rolesResponse.json();
            cachedRoles = (rolesData.roles || []).map((role: any) => ({
              ...role,
              type: "role" as const,
            }));
            mentionableRolesCacheRef.current[serverId] = cachedRoles;
          } else {
            cachedRoles = [];
          }
        }

        const typedRoles = cachedRoles.filter(
          (role: MentionableRole) =>
            role.name.toLowerCase().includes(queryLower) ||
            role.id.toLowerCase().includes(queryLower),
        );
        if (!controller.signal.aborted) setMentionableRoles(typedRoles);
      } catch (error) {
        if (!controller.signal.aborted) setMentionableRoles([]);
      } finally {
        if (!controller.signal.aborted) setIsLoadingUsers(false);
      }
    };

    const debounce = setTimeout(() => {
      void fetchUsersAndRoles();
    }, 150);

    return () => {
      clearTimeout(debounce);
      mentionQueryRequestRef.current?.abort();
    };
  }, [mentionQuery, showMentionAutocomplete, serverId]);

  // Keyboard handling for positioning autocomplete above the keyboard
  useEffect(() => {
    const onShow = (e: any) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleChangeText = useCallback(
    (newValue: string) => {
      onChange(newValue);

      if (!newValue.trim()) {
        mentionedNamesRef.current = [];
        onMentionsChange?.([]);
      }

      const cursorPosition = selection.start ?? newValue.length;
      const mention = getMentionAtCursor(newValue, cursorPosition);

      if (mention) {
        setMentionQuery(mention.username);
        setShowMentionAutocomplete(true);
      } else {
        setShowMentionAutocomplete(false);
        setMentionQuery("");
        setAvailableUsers([]);
      }
    },
    [onChange, onMentionsChange, selection],
  );

  const handleSelectionChange = (
    e: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    setSelection(e.nativeEvent.selection);
  };

  const handleMentionSelect = useCallback(
    (selectable: any | null) => {
      const cursorPosition = selection.start ?? value.length;

      let mentionText: string;
      if (selectable === null) {
        mentionText = "all";
      } else if (selectable.type === "role") {
        mentionText = `role:${selectable.name}`;
      } else {
        mentionText = selectable.displayName || selectable.userId;
      }

      const result = replaceMentionAtCursor(value, cursorPosition, mentionText);
      onChange(result.newText);
      setShowMentionAutocomplete(false);
      setMentionQuery("");
      setAvailableUsers([]);
      setMentionableRoles([]);

      if (!mentionedNamesRef.current.includes(mentionText)) {
        mentionedNamesRef.current = [...mentionedNamesRef.current, mentionText];
        onMentionsChange?.(mentionedNamesRef.current);
      }

      // Return focus to input and set selection
      setTimeout(() => {
        inputRef.current?.focus();
        setSelection({
          start: result.newCursorPosition,
          end: result.newCursorPosition,
        });
      }, 0);
    },
    [value, onChange, onMentionsChange, selection],
  );

  const enhancedPlaceholder = `${placeholder} (type @ to mention)`;
  const colors = useTheme();

  return (
    <View style={{ position: "relative", flex: 1 }}>
      <Input
        ref={inputRef}
        editable={!disabled}
        onChangeText={handleChangeText}
        value={value}
        placeholder={enhancedPlaceholder}
        onSelectionChange={handleSelectionChange}
      />

      {showMentionAutocomplete && (
        <MentionAutocomplete
          query={mentionQuery}
          users={availableUsers}
          roles={mentionableRoles}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionAutocomplete(false);
            setMentionQuery("");
            setAvailableUsers([]);
            setMentionableRoles([]);
          }}
          isLoading={isLoadingUsers}
          canMentionEveryone={canMentionEveryone}
          keyboardHeight={keyboardHeight}
        />
      )}
    </View>
  );
}

export default ChatInput;
