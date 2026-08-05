import { useState } from "react";
import {
    Modal,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { submitReport } from "@/lib/firepit/messages";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

type Props = {
    visible: boolean;
    onClose: () => void;
    targetUserId: string;
    targetDisplayName: string;
};

export function ReportUserModal({
    visible,
    onClose,
    targetUserId,
    targetDisplayName,
}: Props) {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const [justification, setJustification] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<"idle" | "success" | "error">("idle");
    const [resultMessage, setResultMessage] = useState("");

    const trimmed = justification.trim();
    const charCount = trimmed.length;
    const isValid = charCount >= MIN_LENGTH && charCount <= MAX_LENGTH;

    function handleClose() {
        if (submitting) return;
        setJustification("");
        setResult("idle");
        setResultMessage("");
        onClose();
    }

    async function handleSubmit() {
        if (!isValid || submitting) return;
        if (!instanceUrl || !accessToken) {
            setResult("error");
            setResultMessage("You are signed out. Sign in and try again.");
            return;
        }
        setSubmitting(true);
        setResult("idle");
        try {
            const res = await submitReport(
                instanceUrl,
                accessToken,
                targetUserId,
                trimmed,
            );
            if (res.success) {
                setResult("success");
                setResultMessage("Report submitted. An admin will review it.");
                setJustification("");
            } else {
                setResult("error");
                setResultMessage(res.error);
            }
        } catch {
            setResult("error");
            setResultMessage("Failed to submit report.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
        <View style={styles.overlay}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close report dialog"
                style={StyleSheet.absoluteFill}
                onPress={handleClose}
            />
            <View
                style={[
                    styles.container,
                    {
                        backgroundColor: theme.background,
                        borderTopColor: theme.border,
                    },
                ]}
            >
                <View style={styles.header}>
                            <ThemedText type="title">
                                Report {targetDisplayName}
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.description}
                            >
                                Help us keep the community safe. Reports are
                                reviewed by instance admins.
                            </ThemedText>
                        </View>

                        {result === "success" ? (
                            <View style={styles.resultContainer}>
                                <ThemedText
                                    themeColor="foreground"
                                    style={styles.resultText}
                                >
                                    {resultMessage}
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        setResult("idle");
                                        onClose();
                                    }}
                                    style={({ pressed }) => ({
                                        backgroundColor: theme.primary,
                                        borderRadius: 999,
                                        paddingHorizontal: Spacing.three,
                                        paddingVertical: Spacing.two,
                                        opacity: pressed ? 0.85 : 1,
                                        alignSelf: "center",
                                    })}
                                >
                                    <ThemedText
                                        type="smallBold"
                                        themeColor="primaryForeground"
                                    >
                                        Done
                                    </ThemedText>
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                <ThemedText
                                    type="smallBold"
                                    style={styles.label}
                                >
                                    Why are you reporting this user?
                                </ThemedText>
                                <TextInput
                                    multiline
                                    placeholder="Describe what is inappropriate about this user's profile..."
                                    placeholderTextColor={theme.mutedForeground}
                                    value={justification}
                                    onChangeText={setJustification}
                                    maxLength={MAX_LENGTH}
                                    style={[
                                        styles.textInput,
                                        {
                                            borderColor: theme.border,
                                            color: theme.foreground,
                                        },
                                    ]}
                                />
                                <ThemedText
                                    type="code"
                                    themeColor={
                                        charCount > 0 && !isValid
                                            ? "destructive"
                                            : "mutedForeground"
                                    }
                                >
                                    {charCount < MIN_LENGTH
                                        ? `${MIN_LENGTH - charCount} more characters required`
                                        : `${charCount}/${MAX_LENGTH}`}
                                </ThemedText>

                                {result === "error" ? (
                                    <ThemedText
                                        themeColor="destructive"
                                        type="code"
                                    >
                                        {resultMessage}
                                    </ThemedText>
                                ) : null}

                                <View style={styles.buttonRow}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={submitting}
                                        onPress={handleClose}
                                        style={({ pressed }) => ({
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                            borderWidth: 1,
                                            borderRadius: 999,
                                            paddingHorizontal: Spacing.three,
                                            paddingVertical: Spacing.two,
                                            opacity: pressed ? 0.85 : 1,
                                        })}
                                    >
                                        <ThemedText type="smallBold">
                                            Cancel
                                        </ThemedText>
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={!isValid || submitting}
                                        onPress={handleSubmit}
                                        style={({ pressed }) => ({
                                            backgroundColor: theme.destructive,
                                            borderRadius: 999,
                                            paddingHorizontal: Spacing.three,
                                            paddingVertical: Spacing.two,
                                            opacity:
                                                !isValid || submitting
                                                    ? 0.5
                                                    : pressed
                                                      ? 0.85
                                                      : 1,
                                        })}
                                    >
                                        <ThemedText
                                            type="smallBold"
                                            style={{ color: "#fff" }}
                                        >
                                            {submitting
                                                ? "Submitting…"
                                                : "Submit Report"}
                                        </ThemedText>
                                    </Pressable>
                                </View>
                            </>
                        )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: Spacing.four,
        maxHeight: "80%",
    },
    header: {
        gap: Spacing.one,
        marginBottom: Spacing.three,
    },
    description: {
        fontSize: 13,
        lineHeight: 18,
    },
    label: {
        marginBottom: Spacing.one,
    },
    textInput: {
        borderWidth: 1,
        borderRadius: 12,
        padding: Spacing.two,
        minHeight: 100,
        textAlignVertical: "top",
        fontSize: 14,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: Spacing.two,
        marginTop: Spacing.three,
    },
    resultContainer: {
        gap: Spacing.three,
        paddingVertical: Spacing.four,
    },
    resultText: {
        textAlign: "center",
        fontSize: 15,
        lineHeight: 22,
    },
});
