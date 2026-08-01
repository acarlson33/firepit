import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type PollOption = {
  id: string;
  text: string;
  count: number;
  voterIds: string[];
};

export type PollData = {
  id: string;
  question: string;
  options: PollOption[];
  status: "open" | "closed";
  createdBy: string;
  closedAt?: string;
  closedBy?: string;
};

type Props = {
  poll: PollData;
  currentUserId?: string;
  canClose?: boolean;
  readOnly?: boolean;
  onVote?: (optionId: string) => void | Promise<void>;
  onClose?: () => void | Promise<void>;
};

export function MessagePoll({
  poll,
  currentUserId,
  canClose = false,
  readOnly = false,
  onVote,
  onClose,
}: Props) {
  const theme = useTheme();

  const closed = poll.status === "closed";
  const totalVotes = poll.options.reduce((s, o) => s + o.count, 0);

  const selectedOptionId = currentUserId
    ? poll.options.find((o) => o.voterIds.includes(currentUserId))?.id ?? null
    : null;

  return (
    <ThemedView
      style={[
        styles.container,
        { borderColor: theme.border, backgroundColor: theme.muted + "40" },
      ]}
    >
      {/* Header: question + closed badge */}
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          {poll.question}
        </ThemedText>
        {closed ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.muted },
            ]}
          >
            <ThemedText type="code" themeColor="mutedForeground">
              Closed
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Poll options — each is a pressable row like the web app's Button */}
      <View style={styles.optionsList}>
        {poll.options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const pct = totalVotes > 0 ? Math.round((option.count / totalVotes) * 100) : 0;

          return (
            <Pressable
              key={option.id}
              disabled={readOnly || closed || !onVote}
              onPress={() => onVote?.(option.id)}
              style={({ pressed }) => [
                styles.optionButton,
                {
                  borderColor: isSelected ? theme.primary : theme.border,
                  backgroundColor: isSelected
                    ? theme.primary + "18"
                    : theme.card,
                  opacity: pressed && !readOnly && !closed ? 0.8 : 1,
                },
              ]}
            >
              {/* Progress bar — positioned absolutely behind content */}
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${pct}%`,
                    backgroundColor: isSelected
                      ? theme.primary + "25"
                      : theme.muted + "80",
                  },
                ]}
              />
              {/* Option text + vote count */}
              <View style={styles.optionContent}>
                <ThemedText
                  style={[
                    styles.optionText,
                    isSelected && { fontWeight: "600" },
                  ]}
                  numberOfLines={2}
                >
                  {option.text}
                </ThemedText>
                <ThemedText type="code" themeColor="mutedForeground">
                  {option.count}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Footer: total votes + close button */}
      <View style={styles.footerRow}>
        <ThemedText type="code" themeColor="mutedForeground">
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </ThemedText>
        <View style={styles.footerRight}>
          {readOnly && !closed ? (
            <View
              style={[
                styles.readOnlyBadge,
                { backgroundColor: theme.muted },
              ]}
            >
              <ThemedText type="code" themeColor="mutedForeground">
                Read-only
              </ThemedText>
            </View>
          ) : null}
          {canClose && !closed ? (
            <Pressable
              onPress={() => onClose?.()}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: theme.destructive + "20",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <ThemedText type="code" themeColor="destructive">
                Close poll
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: 99,
  },
  optionsList: {
    gap: Spacing.half,
  },
  optionButton: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    overflow: "hidden",
    position: "relative",
  },
  progressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    gap: Spacing.one,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.one,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  readOnlyBadge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: 99,
  },
  closeButton: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
