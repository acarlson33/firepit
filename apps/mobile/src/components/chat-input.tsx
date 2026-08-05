import React, { forwardRef, useRef, useState, useEffect, useMemo, useCallback } from "react";
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
import * as Clipboard from "expo-clipboard";
import { cacheDirectory, readAsStringAsync, writeAsStringAsync } from "expo-file-system/legacy";
import PasteInput from "@mattermost/react-native-paste-input";
import type { PastedFile } from "@mattermost/react-native-paste-input";
import { useTheme } from "@/hooks/use-theme";
import { authHeaders } from "@/lib/firepit/http";
import MentionAutocomplete from "@/components/mention-autocomplete";
import EmojiAutocomplete, { filterEmojis } from "@/components/emoji-autocomplete";
import type { AutocompleteEmoji } from "@/components/emoji-autocomplete";
import { STANDARD_EMOJI } from "@/components/emoji-renderer";
import {
  getMentionAtCursor,
  replaceMentionAtCursor,
  getEmojiAtCursor,
  replaceEmojiAtCursor,
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
  remoteAttachment?: {
    fileId?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    fileUrl: string;
    thumbnailUrl?: string;
    previewUrl?: string;
    mediaKind?: string;
    source?: string;
    packId?: string;
    itemId?: string;
  };
};

export type ComposerAttachmentState = {
  image: ComposerAttachment | null;
  files: ComposerAttachment[];
};

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onMentionsChange?: (names: string[]) => void;
  serverId?: string;
  canMentionEveryone?: boolean;
  instanceUrl: string;
  accessToken: string;
  attachments: ComposerAttachmentState;
  onAttachmentsChange: (attachments: ComposerAttachmentState) => void;
  onSend?: () => void;
  sending?: boolean;
  customEmojis?: AutocompleteEmoji[];
  onOpenPollCreate?: () => void;
  onOpenGifStickerPicker?: () => void;
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

function ChatInputInner({
  value,
  onChange,
  onChangeText,
  placeholder = "Type a message",
  disabled = false,
  onMentionsChange,
  serverId,
  canMentionEveryone,
  instanceUrl,
  accessToken,
  attachments,
  onAttachmentsChange,
  onSend,
  sending = false,
  customEmojis,
  onOpenPollCreate,
  onOpenGifStickerPicker,
}: ChatInputProps, ref: React.ForwardedRef<TextInput>) {
  const theme = useTheme();
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showEmojiAutocomplete, setShowEmojiAutocomplete] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
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
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [selectedEmojiIndex, setSelectedEmojiIndex] = useState(0);

  const internalRef = useRef<TextInput | null>(null);
  const mentionedNamesRef = useRef<string[]>([]);
  const mentionableRolesCacheRef = useRef<Record<string, MentionableRole[]>>(
    {},
  );
  const mentionQueryRequestRef = useRef<AbortController | null>(null);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const handlePaste = useCallback(async (error: string | null | undefined, files: Array<PastedFile>) => {
    if (error || !files.length) return;

    const cacheDir = cacheDirectory;
    const cached = await Promise.all(
      files.map(async (f) => {
        const name = f.fileName || `pasted-${Date.now()}`;
        if (!cacheDir) {
          console.error("[Paste] cacheDirectory is null, cannot copy file");
          return f;
        }
        const dest = `${cacheDir}${name}`;
        try {
          const content = await readAsStringAsync(f.uri, { encoding: "base64" });
          await writeAsStringAsync(dest, content, { encoding: "base64" });
          return { ...f, uri: dest };
        } catch (e) {
          console.error("[Paste] Failed to copy file to cache, using original URI:", e);
          return f;
        }
      }),
    );

    const imageFile = cached.find(
      (f) => f.type.startsWith("image/"),
    );

    if (imageFile && !attachments.image) {
      onAttachmentsChange({
        image: {
          uri: imageFile.uri,
          name: imageFile.fileName || "pasted-image",
          mimeType: imageFile.type,
          size: imageFile.fileSize,
        },
        files: [
          ...attachments.files.map((f) => ({ ...f })),
          ...cached
            .filter((f) => f !== imageFile)
            .map((f) => ({
              uri: f.uri,
              name: f.fileName || "pasted-file",
              mimeType: f.type,
              size: f.fileSize,
            })),
        ],
      });
    } else {
      onAttachmentsChange({
        image: attachments.image ? { ...attachments.image } : null,
        files: [
          ...attachments.files.map((f) => ({ ...f })),
          ...cached.map((f) => ({
            uri: f.uri,
            name: f.fileName || "pasted-file",
            mimeType: f.type,
            size: f.fileSize,
          })),
        ],
      });
    }
  }, [attachments, onAttachmentsChange]);

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
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const query = mentionQuery || "";
      const queryLower = query.toLowerCase();

      try {
        const response = await fetch(
          `${instanceUrl}/api/users/search?q=${encodeURIComponent(query)}&limit=10`,
          { signal: controller.signal, headers: authHeaders(accessToken) },
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
        clearTimeout(timeout);
        return;
      }

      try {
        let cachedRoles = mentionableRolesCacheRef.current[serverId];

        if (!cachedRoles) {
          const rolesResponse = await fetch(
            `${instanceUrl}/api/servers/${serverId}/mentionable-roles`,
            { signal: controller.signal, headers: authHeaders(accessToken) },
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
        clearTimeout(timeout);
        if (mentionQueryRequestRef.current === controller) {
          setIsLoadingUsers(false);
        }
      }
    };

    const debounce = setTimeout(() => {
      void fetchUsersAndRoles();
    }, 150);

    return () => {
      clearTimeout(debounce);
      mentionQueryRequestRef.current?.abort();
    };
  }, [mentionQuery, showMentionAutocomplete, serverId, instanceUrl, accessToken]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [availableUsers, mentionableRoles]);

  useEffect(() => {
    setSelectedEmojiIndex(0);
  }, [emojiQuery]);

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
      onChangeText?.(newValue);

      if (!newValue.trim()) {
        mentionedNamesRef.current = [];
        onMentionsChange?.([]);
      }

      const cursorPosition = selection.start ?? newValue.length;

      // Check for mention autocomplete (@)
      const mention = getMentionAtCursor(newValue, cursorPosition);
      if (mention) {
        setMentionQuery(mention.username);
        setShowMentionAutocomplete(true);
      } else {
        setShowMentionAutocomplete(false);
        setMentionQuery("");
        setAvailableUsers([]);
      }

      // Check for emoji autocomplete (:)
      const emoji = getEmojiAtCursor(newValue, cursorPosition);
      if (emoji) {
        setEmojiQuery(emoji.shortcode);
        setShowEmojiAutocomplete(true);
      } else {
        setShowEmojiAutocomplete(false);
        setEmojiQuery("");
      }
    },
    [onChange, onChangeText, onMentionsChange, selection],
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
        internalRef.current?.focus();
        setSelection({
          start: result.newCursorPosition,
          end: result.newCursorPosition,
        });
      }, 0);
    },
    [value, onChange, onMentionsChange, selection],
  );

  const handleEmojiSelect = useCallback(
    (emoji: AutocompleteEmoji) => {
      const cursorPosition = selection.start ?? value.length;
      const result = replaceEmojiAtCursor(value, cursorPosition, emoji.shortcode);
      onChange(result.newText);
      setShowEmojiAutocomplete(false);
      setEmojiQuery("");

      setTimeout(() => {
        internalRef.current?.focus();
        setSelection({
          start: result.newCursorPosition,
          end: result.newCursorPosition,
        });
      }, 0);
    },
    [value, onChange, selection],
  );

  const mentionItemsCount = useMemo(() => {
    let count = 0;
    if (canMentionEveryone) count += 1;
    count += mentionableRoles.length;
    count += availableUsers.length;
    return count;
  }, [canMentionEveryone, mentionableRoles, availableUsers]);

  const emojiItems = useMemo(
    () => filterEmojis(emojiQuery, STANDARD_EMOJI, customEmojis ?? []),
    [emojiQuery, customEmojis],
  );

  const handleKeyPress = useCallback(
    (e: any) => {
      const key = e.nativeEvent.key;

      if (key === "Escape") {
        if (showMentionAutocomplete) {
          setShowMentionAutocomplete(false);
          setMentionQuery("");
          setAvailableUsers([]);
          setMentionableRoles([]);
        }
        if (showEmojiAutocomplete) {
          setShowEmojiAutocomplete(false);
          setEmojiQuery("");
        }
        return;
      }

      if (showMentionAutocomplete && mentionItemsCount > 0) {
        if (key === "ArrowDown") {
          e.preventDefault?.();
          setSelectedMentionIndex((prev) => (prev + 1) % mentionItemsCount);
          return;
        }
        if (key === "ArrowUp") {
          e.preventDefault?.();
          setSelectedMentionIndex((prev) => (prev - 1 + mentionItemsCount) % mentionItemsCount);
          return;
        }
        if (key === "Enter") {
          e.preventDefault?.();
          let idx = 0;
          if (canMentionEveryone) {
            if (selectedMentionIndex === idx) {
              handleMentionSelect(null);
              return;
            }
            idx++;
          }
          const roleIdx = selectedMentionIndex - idx;
          if (roleIdx >= 0 && roleIdx < mentionableRoles.length) {
            handleMentionSelect(mentionableRoles[roleIdx]);
            return;
          }
          idx += mentionableRoles.length;
          const userIdx = selectedMentionIndex - idx;
          if (userIdx >= 0 && userIdx < availableUsers.length) {
            handleMentionSelect(availableUsers[userIdx]);
            return;
          }
          return;
        }
      }

      if (showEmojiAutocomplete) {
        const emojiItemsCount = emojiItems.length;
        if (emojiItemsCount === 0) return;

        if (key === "ArrowDown") {
          e.preventDefault?.();
          setSelectedEmojiIndex((prev) => (prev + 1) % emojiItemsCount);
          return;
        }
        if (key === "ArrowUp") {
          e.preventDefault?.();
          setSelectedEmojiIndex((prev) => (prev - 1 + emojiItemsCount) % emojiItemsCount);
          return;
        }
        if (key === "Enter") {
          e.preventDefault?.();
          const emoji = emojiItems[selectedEmojiIndex];
          if (emoji) {
            handleEmojiSelect(emoji);
          }
          return;
        }
      }
    },
    [
      showMentionAutocomplete,
      showEmojiAutocomplete,
      mentionItemsCount,
      emojiItems,
      handleEmojiSelect,
      selectedMentionIndex,
      selectedEmojiIndex,
      customEmojis,
      canMentionEveryone,
      mentionableRoles,
      availableUsers,
      handleMentionSelect,
    ],
  );

  const addSelectedImage = useCallback(async () => {
    if (disabled) return;

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

    if (result.canceled || !result.assets?.[0]) return;

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
  }, [attachments, disabled, onAttachmentsChange]);

  const addSelectedFile = useCallback(async () => {
    if (disabled) return;

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

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
  }, [attachments, disabled, onAttachmentsChange]);

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
        files: attachments.files.filter((_, ci) => ci !== index),
      });
    },
    [attachments, onAttachmentsChange],
  );

  const pasteFromClipboard = useCallback(async () => {
    if (disabled) return;

    const hasImage = await Clipboard.hasImageAsync();
    if (!hasImage) {
      Alert.alert("No image", "No image found on clipboard.");
      return;
    }

    const clipboardImage = await Clipboard.getImageAsync({ format: "png" });
    if (!clipboardImage) return;

    onAttachmentsChange({
      image: {
        uri: clipboardImage.data,
        name: "pasted-image.png",
        mimeType: "image/png",
        size: null,
      },
      files: cloneAttachments(attachments).files,
    });
  }, [attachments, disabled, onAttachmentsChange]);

  const enhancedPlaceholder = `${placeholder} (type @ to mention)`;

  return (
    <View style={{ position: 'relative' }}>
      {showMentionAutocomplete && (
        <MentionAutocomplete
          users={availableUsers}
          roles={mentionableRoles}
          onSelect={handleMentionSelect}
          isLoading={isLoadingUsers}
          canMentionEveryone={canMentionEveryone}
          selectedIndex={selectedMentionIndex}
        />
      )}

      {showEmojiAutocomplete && (
        <EmojiAutocomplete
          query={emojiQuery}
          standardEmojis={STANDARD_EMOJI}
          customEmojis={customEmojis ?? []}
          onSelect={handleEmojiSelect}
          selectedIndex={selectedEmojiIndex}
          onSelectedIndexChange={setSelectedEmojiIndex}
        />
      )}

      {/* Attachment chips row -- compact, above input */}
      {(attachments.image || attachments.files.length > 0) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {attachments.image ? (
            <Pressable
              disabled={disabled}
              onPress={removeImage}
              style={{
                flexDirection: "row",
                gap: 4,
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.06)",
              }}
            >
              <Text style={{ fontSize: 12, color: theme.text }}>{attachmentLabel(attachments.image, "Image")}</Text>
              <Text style={{ fontSize: 12, opacity: 0.5, color: theme.text }}>x</Text>
            </Pressable>
          ) : null}
          {attachments.files.map((file, index) => (
            <Pressable
              key={`${file.uri}-${index}`}
              disabled={disabled}
              onPress={() => removeFile(index)}
              style={{
                flexDirection: "row",
                gap: 4,
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.06)",
              }}
            >
              <Text style={{ fontSize: 12, color: theme.text }}>{attachmentLabel(file, `File ${index + 1}`)}</Text>
              <Text style={{ fontSize: 12, opacity: 0.5, color: theme.text }}>x</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Input row: text field + action buttons */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        <View style={{ flex: 1 }}>
          <PasteInput
            ref={(node) => {
              internalRef.current = node as unknown as TextInput;
              if (typeof ref === "function") ref(node as unknown as TextInput);
              else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node as unknown as TextInput;
            }}
            editable={!disabled}
            onChangeText={handleChangeText}
            value={value}
            placeholder={enhancedPlaceholder}
            placeholderTextColor={theme.textSecondary}
            onSelectionChange={handleSelectionChange}
            onKeyPress={handleKeyPress}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onPaste={handlePaste}
            multiline
            style={{
              maxHeight: 120,
              minHeight: 36,
              textAlignVertical: "center",
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.input,
              color: theme.text,
              backgroundColor: theme.backgroundElement,
            }}
          />
        </View>

        {/* Media button */}
        <Pressable
          disabled={disabled}
          onPress={() => setShowMediaMenu(true)}
          style={({ pressed }) => ({
            height: 36,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text }}>Media</Text>
        </Pressable>

        {/* Send button */}
        <Pressable
          disabled={disabled || sending}
          onPress={() => {
            if (onSend) {
              onSend();
            } else {
              onChange(value + "\n");
            }
          }}
          style={({ pressed }) => ({
            height: 36,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "#D9792B",
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled || sending ? 0.45 : pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
            {sending ? "..." : "Send"}
          </Text>
        </Pressable>
      </View>

      {showMediaMenu && (
        <Pressable
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          onPress={() => setShowMediaMenu(false)}
        />
      )}
      {showMediaMenu && (
        <View
          style={{
            position: "absolute",
            bottom: 44,
            right: 0,
            backgroundColor: theme.popover,
            borderRadius: 10,
            paddingVertical: 4,
            elevation: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
          }}
        >
          <Pressable
            onPress={() => {
              setShowMediaMenu(false);
              void addSelectedFile();
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 14, color: theme.text }}>Upload file</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowMediaMenu(false);
              void addSelectedImage();
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 14, color: theme.text }}>Upload image</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowMediaMenu(false);
              void pasteFromClipboard();
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 14, color: theme.text }}>Paste image</Text>
          </Pressable>
          {onOpenPollCreate ? (
            <Pressable
              onPress={() => {
                setShowMediaMenu(false);
                onOpenPollCreate();
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 14, color: theme.text }}>Create poll</Text>
            </Pressable>
          ) : null}
          {onOpenGifStickerPicker ? (
            <Pressable
              onPress={() => {
                setShowMediaMenu(false);
                onOpenGifStickerPicker();
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 14, color: theme.text }}>Browse GIFs</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

export const ChatInput = forwardRef<TextInput, ChatInputProps>(ChatInputInner);

export default ChatInput;
