import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useRelationship } from "@/hooks/use-relationship";

type RelationshipActionsProps = {
    targetUserId: string;
};

type ActionButtonProps = {
    label: string;
    onPress: () => void;
    tone?: "primary" | "secondary" | "destructive" | "ghost";
    disabled?: boolean;
};

function ActionPill({ label, onPress, tone = "primary", disabled }: ActionButtonProps) {
    const theme = useTheme();
    const bg = {
        primary: theme.primary,
        secondary: theme.secondary,
        destructive: theme.destructive,
        ghost: theme.muted,
    }[tone];
    const fg = {
        primary: theme.primaryForeground,
        secondary: theme.foreground,
        destructive: "#fff",
        ghost: theme.foreground,
    }[tone];

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
                backgroundColor: bg,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.one + 2,
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
        >
            <ThemedText type="smallBold" style={{ color: fg }}>
                {label}
            </ThemedText>
        </Pressable>
    );
}

function StatusBadge({ label, tone }: { label: string; tone: "neutral" | "success" | "warning" | "destructive" }) {
    const theme = useTheme();
    const colors = {
        neutral: theme.muted,
        success: theme.success ?? "#22c55e",
        warning: theme.warning ?? "#f59e0b",
        destructive: theme.destructive,
    };
    const textColors = {
        neutral: theme.mutedForeground,
        success: "#fff",
        warning: "#fff",
        destructive: "#fff",
    };

    return (
        <View
            style={{
                backgroundColor: colors[tone],
                paddingHorizontal: Spacing.two,
                paddingVertical: Spacing.half,
                borderRadius: 999,
                alignSelf: "flex-start",
            }}
        >
            <ThemedText
                type="code"
                style={{ color: textColors[tone], fontSize: 11 }}
            >
                {label}
            </ThemedText>
        </View>
    );
}

export function RelationshipActions({
    targetUserId,
}: RelationshipActionsProps) {
    const {
        relationship,
        loading,
        actionLoading,
        error,
        isSelf,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
        blockUser,
        unblockUser,
    } = useRelationship(targetUserId);

    const [blockConfirming, setBlockConfirming] = useState(false);

    if (isSelf) return null;
    if (loading && !relationship) {
        return (
            <ThemedText themeColor="mutedForeground" type="code">
                Loading…
            </ThemedText>
        );
    }

    const disabled = loading || actionLoading;

    return (
        <View style={styles.container}>
            {relationship ? (
                <View style={styles.badgeRow}>
                    {relationship.isFriend ? (
                        <StatusBadge label="Friend" tone="success" />
                    ) : null}
                    {relationship.incomingRequest ? (
                        <StatusBadge label="Incoming request" tone="warning" />
                    ) : null}
                    {relationship.outgoingRequest ? (
                        <StatusBadge label="Request sent" tone="neutral" />
                    ) : null}
                    {relationship.blockedByMe ? (
                        <StatusBadge label="Blocked" tone="destructive" />
                    ) : null}
                    {relationship.blockedMe ? (
                        <StatusBadge label="Blocked you" tone="neutral" />
                    ) : null}
                    {relationship.directMessagePrivacy === "friends" && !relationship.isFriend ? (
                        <StatusBadge label="Friends-only DMs" tone="neutral" />
                    ) : null}
                </View>
            ) : null}

            <View style={styles.buttonRow}>
                {relationship?.incomingRequest ? (
                    <>
                        <ActionPill
                            label="Accept"
                            onPress={() => void acceptFriendRequest()}
                            disabled={disabled}
                            tone="primary"
                        />
                        <ActionPill
                            label="Decline"
                            onPress={() => void declineFriendRequest()}
                            disabled={disabled}
                            tone="ghost"
                        />
                    </>
                ) : relationship?.isFriend ? (
                    <ActionPill
                        label="Remove Friend"
                        onPress={() => void removeFriendship()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : relationship?.outgoingRequest ? (
                    <ActionPill
                        label="Cancel Request"
                        onPress={() => void removeFriendship()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : relationship?.canReceiveFriendRequest ? (
                    <ActionPill
                        label="Add Friend"
                        onPress={() => void sendFriendRequest()}
                        disabled={disabled}
                        tone="primary"
                    />
                ) : null}

                {relationship?.blockedByMe ? (
                    <ActionPill
                        label="Unblock"
                        onPress={() => void unblockUser()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : blockConfirming ? (
                    <>
                        <ActionPill
                            label="Confirm Block"
                            onPress={() => {
                                void blockUser();
                                setBlockConfirming(false);
                            }}
                            disabled={disabled}
                            tone="destructive"
                        />
                        <ActionPill
                            label="Cancel"
                            onPress={() => setBlockConfirming(false)}
                            disabled={disabled}
                            tone="ghost"
                        />
                    </>
                ) : (
                    <ActionPill
                        label="Block"
                        onPress={() => setBlockConfirming(true)}
                        disabled={disabled || relationship?.blockedMe}
                        tone="destructive"
                    />
                )}
            </View>

            {error ? (
                <ThemedText themeColor="destructive" type="code">
                    {error}
                </ThemedText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: Spacing.two,
    },
    badgeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    buttonRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
});
