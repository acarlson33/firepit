import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  Keyboard,
  Pressable,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Input } from "@/components/ui/input";
import MentionAutocomplete from "@/components/mention-autocomplete";
import {
  getMentionAtCursor,
  replaceMentionAtCursor,
} from "@/lib/mention-utils";

type MentionableRole = {
  readonly type: "role";
  id: string;
  name: string;
  color: string;
  mentionable: boolean;
  memberCount: number;
};

export type ComposerAttachment = {
  uri: string;
  name?: string;
  mimeType?: string | null;
  size?: number | null;
};

export type ComposerAttachmentState = {
  image: ComposerAttachment | null;
  files: ComposerAttachment[];
};

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onMentionsChange?: (names: string[]) => void;
  serverId?: string;
  canMentionEveryone?: boolean;
  attachments: ComposerAttachmentState;
  onAttachmentsChange: (attachments: ComposerAttachmentState) => void;
};

function cloneAttachments(attachments: ComposerAttachmentState) {
  return {
    image: attachments.image ? { ...attachments.image } : null,
    files: attachments.files.map((file) => ({ ...file })),
  };
}

function attachmentLabel(attachment: ComposerAttachment, fallback: string) {
  return attachment.name?.trim() || fallback;
}

export function ChatInput({
  value,
  onChange,
  placeholder = "Type a message",
  disabled = false,
  onMentionsChange,
  serverId,
  canMentionEveryone,
  attachments,
  onAttachmentsChange,
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

  const addSelectedImage = useCallback(
    async () => {
      if (disabled) {
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access to attach an image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      onAttachmentsChange({
        image: {
          uri: asset.uri,
          name: asset.fileName ?? "image.jpg",
          mimeType: asset.mimeType ?? "image/jpeg",
          size: asset.fileSize ?? null,
        },
        files: cloneAttachments(attachments).files,
      });
    },
    [attachments, disabled, onAttachmentsChange],
  );

  const addSelectedFile = useCallback(
    async () => {
      if (disabled) {
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      onAttachmentsChange({
        image: attachments.image ? { ...attachments.image } : null,
        files: [
          ...attachments.files.map((file) => ({ ...file })),
          {
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType ?? null,
            size: asset.size ?? null,
          },
        ],
      });
    },
    [attachments, disabled, onAttachmentsChange],
  );

  const removeImage = useCallback(() => {
    onAttachmentsChange({
      image: null,
      files: attachments.files.map((file) => ({ ...file })),
    });
  }, [attachments.files, onAttachmentsChange]);

  const removeFile = useCallback(
    (index: number) => {
      onAttachmentsChange({
        image: attachments.image ? { ...attachments.image } : null,
        files: attachments.files.filter((_, currentIndex) => currentIndex !== index),
      });
    },
    [attachments, onAttachmentsChange],
  );

  const enhancedPlaceholder = `${placeholder} (type @ to mention)`;

  return (
    <View style={{ position: "relative", flex: 1, gap: 8 }}>
      <Input
        ref={inputRef}
        editable={!disabled}
        onChangeText={handleChangeText}
        value={value}
        placeholder={enhancedPlaceholder}
        onSelectionChange={handleSelectionChange}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          disabled={disabled}
          onPress={() => void addSelectedImage()}
          style={({ pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#999",
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          })}
        >
          <Text>Attach image</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => void addSelectedFile()}
          style={({ pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#999",
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          })}
        >
          <Text>Attach file</Text>
        </Pressable>
      </View>

      {attachments.image || attachments.files.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, opacity: 0.7 }}>Attachments</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {attachments.image ? (
              <Pressable
                disabled={disabled}
                onPress={removeImage}
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.08)",
                }}
              >
                <Text>{attachmentLabel(attachments.image, "Selected image")}</Text>
                <Text>×</Text>
              </Pressable>
            ) : null}
            {attachments.files.map((file, index) => (
              <Pressable
                key={`${file.uri}-${index}`}
                disabled={disabled}
                onPress={() => removeFile(index)}
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.08)",
                }}
              >
                <Text>{attachmentLabel(file, `File ${index + 1}`)}</Text>
                <Text>×</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

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
