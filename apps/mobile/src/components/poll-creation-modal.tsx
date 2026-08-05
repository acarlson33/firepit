import React, { useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => void;
};

type Option = { id: string; text: string };

export function PollCreationModal({ visible, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const [question, setQuestion] = useState("");
  const optionIdRef = useRef(0);
  const createOption = (): Option => ({
    id: `poll-option-${++optionIdRef.current}`,
    text: "",
  });
  const [options, setOptions] = useState<Option[]>([createOption(), createOption()]);

  const updateOption = (index: number, text: string) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text } : opt)),
    );
  };

  const addOption = () => {
    if (options.length < 10) {
      setOptions((prev) => [...prev, createOption()]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const canSubmit =
    question.trim().length > 0 &&
    options.filter((o) => o.text.trim().length > 0).length >= 2;

  const handleSubmit = () => {
    const validOptions = options.filter((o) => o.text.trim().length > 0);
    if (validOptions.length < 2 || !question.trim()) return;
    onSubmit(question.trim(), validOptions.map((o) => o.text.trim()));
    setQuestion("");
    setOptions([createOption(), createOption()]);
    onClose();
  };

  const handleClose = () => {
    setQuestion("");
    setOptions([createOption(), createOption()]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => Keyboard.dismiss()}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <ThemedText type="title" style={styles.title}>
              Create Poll
            </ThemedText>

            <ThemedText type="smallBold" style={styles.label}>
              Question
            </ThemedText>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="What do you want to ask?"
              placeholderTextColor={theme.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              maxLength={300}
            />

            <ThemedText type="smallBold" style={styles.label}>
              Options ({options.length}/10)
            </ThemedText>

            {options.map((option, index) => (
              <View key={option.id} style={styles.optionRow}>
                <TextInput
                  value={option.text}
                  onChangeText={(text) => updateOption(index, text)}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={theme.mutedForeground}
                  style={[
                    styles.input,
                    styles.optionInput,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  maxLength={120}
                />
                {options.length > 2 ? (
                  <Pressable
                    onPress={() => removeOption(index)}
                    style={[styles.removeBtn, { backgroundColor: theme.destructive + "20" }]}
                  >
                    <ThemedText themeColor="destructive">✕</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ))}

            {options.length < 10 ? (
              <Pressable
                onPress={addOption}
                style={[styles.addBtn, { borderColor: theme.border }]}
              >
                <ThemedText themeColor="mutedForeground">+ Add option</ThemedText>
              </Pressable>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={handleClose}
                style={[styles.actionBtn, { backgroundColor: theme.muted }]}
              >
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[
                  styles.actionBtn,
                  styles.submitBtn,
                  {
                    backgroundColor: canSubmit ? theme.primary : theme.muted,
                    opacity: canSubmit ? 1 : 0.5,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  themeColor={canSubmit ? "primaryForeground" : "mutedForeground"}
                >
                  Create Poll
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: Spacing.four,
    maxHeight: "80%",
  },
  title: {
    marginBottom: Spacing.three,
  },
  label: {
    marginBottom: Spacing.one,
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 44,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  optionInput: {
    flex: 1,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    paddingVertical: Spacing.two,
    alignItems: "center",
    marginTop: Spacing.one,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
  submitBtn: {
    // backgroundColor set dynamically
  },
});
