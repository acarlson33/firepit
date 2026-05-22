import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";

import { ExternalLink } from "./external-link";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";

export default function AppTabs() {
    return (
        <Tabs>
            <TabSlot style={{ height: "100%" }} />
            <TabList asChild>
                <CustomTabList>
                    <TabTrigger name="home" href="/home" asChild>
                        <TabButton>Home</TabButton>
                    </TabTrigger>
                    <TabTrigger name="chat" href="/chat" asChild>
                        <TabButton>Chat</TabButton>
                    </TabTrigger>
                    <TabTrigger name="admin" href="/admin" asChild>
                        <TabButton>Admin</TabButton>
                    </TabTrigger>
                    <TabTrigger name="settings" href="/settings" asChild>
                        <TabButton>Settings</TabButton>
                    </TabTrigger>
                </CustomTabList>
            </TabList>
        </Tabs>
    );
}

export function TabButton({
    children,
    isFocused,
    ...props
}: TabTriggerSlotProps) {
    const scheme = useColorScheme();
    const colors = Colors[scheme === "dark" ? "dark" : "light"];

    return (
        <Pressable
            {...props}
            style={({ pressed }) => pressed && styles.pressed}
        >
            <ThemedView
                type={isFocused ? "secondary" : "card"}
                style={[styles.tabButtonView, { borderColor: colors.border }]}
            >
                <ThemedText
                    type="small"
                    themeColor={isFocused ? "foreground" : "mutedForeground"}
                >
                    {children}
                </ThemedText>
            </ThemedView>
        </Pressable>
    );
}

export function CustomTabList(props: TabListProps) {
    const scheme = useColorScheme();
    const colors = Colors[scheme === "dark" ? "dark" : "light"];

    return (
        <View {...props} style={styles.tabListContainer}>
            <ThemedView
                type="sidebar"
                style={[
                    styles.innerContainer,
                    {
                        borderColor: colors.sidebarBorder,
                        shadowOpacity: scheme === "dark" ? 0.24 : 0.08,
                    },
                ]}
            >
                <ThemedText
                    type="smallBold"
                    style={styles.brandText}
                    themeColor="foreground"
                >
                    Firepit
                </ThemedText>

                {props.children}

                <ExternalLink href="https://docs.expo.dev" asChild>
                    <Pressable style={styles.externalPressable}>
                        <ThemedText type="link" themeColor="primary">
                            Docs
                        </ThemedText>
                        <SymbolView
                            tintColor={colors.foreground}
                            name={{ ios: "arrow.up.right.square", web: "link" }}
                            size={12}
                        />
                    </Pressable>
                </ExternalLink>
            </ThemedView>
        </View>
    );
}

const styles = StyleSheet.create({
    tabListContainer: {
        position: "absolute",
        width: "100%",
        padding: Spacing.three,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
    },
    innerContainer: {
        paddingVertical: Spacing.two,
        paddingHorizontal: Spacing.five,
        borderRadius: Spacing.five,
        flexDirection: "row",
        alignItems: "center",
        flexGrow: 1,
        gap: Spacing.two,
        maxWidth: MaxContentWidth,
        borderWidth: 1,
        borderColor: Colors.light.sidebarBorder,
        shadowColor: "#000000",
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    brandText: {
        marginRight: "auto",
    },
    pressed: {
        opacity: 0.7,
    },
    tabButtonView: {
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.three,
        borderRadius: Spacing.three,
        borderWidth: 1,
    },
    externalPressable: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: Spacing.one,
        marginLeft: Spacing.three,
    },
});
