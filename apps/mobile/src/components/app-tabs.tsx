import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
    const scheme = useColorScheme();
    const colors = Colors[scheme === "dark" ? "dark" : "light"];

    return (
        <NativeTabs
            backgroundColor={colors.sidebar}
            indicatorColor={colors.primary}
            labelStyle={{
                default: { color: colors.textSecondary },
                selected: { color: colors.foreground },
            }}
        >
            <NativeTabs.Trigger name="home">
                <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("@/assets/images/tabIcons/home.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="chat">
                <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("@/assets/images/tabIcons/explore.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="admin">
                <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("@/assets/images/tabIcons/home.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="settings">
                <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={require("@/assets/images/tabIcons/explore.png")}
                    renderingMode="template"
                />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
