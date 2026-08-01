import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { updateProfile, uploadProfileBackground } from "@/lib/firepit/profiles";

const PRESET_COLORS = [
    "#1a1a2e", "#16213e", "#0f3460", "#533483",
    "#e94560", "#2d3436", "#636e72", "#d63031",
    "#e17055", "#fdcb6e", "#00b894", "#0984e3",
    "#6c5ce7", "#a29bfe", "#fd79a8", "#81ecec",
];

const PRESET_GRADIENTS: { name: string; cssValue: string; colors: string[] }[] = [
    { name: "Blessed Calm", cssValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", colors: ["#667eea", "#764ba2"] },
    { name: "Sunrise", cssValue: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)", colors: ["#ff6b6b", "#feca57"] },
    { name: "Deep Space", cssValue: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", colors: ["#0f0c29", "#302b63", "#24243e"] },
    { name: "Coral Dream", cssValue: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)", colors: ["#ff9a9e", "#fecfef"] },
    { name: "Forest Mist", cssValue: "linear-gradient(135deg, #66785f 0%, #91ac8f 100%)", colors: ["#66785f", "#91ac8f"] },
    { name: "Midnight City", cssValue: "linear-gradient(135deg, #232526 0%, #414345 100%)", colors: ["#232526", "#414345"] },
    { name: "Royal Passion", cssValue: "linear-gradient(135deg, #c31432 0%, #240b36 100%)", colors: ["#c31432", "#240b36"] },
    { name: "Ocean Haze", cssValue: "linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)", colors: ["#2c3e50", "#4ca1af"] },
    { name: "Firewatch", cssValue: "linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)", colors: ["#c94b4b", "#4b134f"] },
    { name: "Cosmic Fusion", cssValue: "linear-gradient(135deg, #ff00cc 0%, #333399 100%)", colors: ["#ff00cc", "#333399"] },
    { name: "Frost", cssValue: "linear-gradient(135deg, #c9d6ff 0%, #e2e2e2 100%)", colors: ["#c9d6ff", "#e2e2e2"] },
    { name: "Moss", cssValue: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)", colors: ["#134e5e", "#71b280"] },
];

export default function AppearanceSettingsScreen() {
    const theme = useTheme();
    const { currentUser, instanceUrl, accessToken, refresh } =
        useFirepitBootstrap();
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const currentColor = currentUser?.profileBackgroundColor ?? null;
    const currentGradient = currentUser?.profileBackgroundGradient ?? null;
    const currentImageUrl = currentUser?.profileBackgroundUrl ?? null;
    const currentFrame = currentUser?.avatarFramePreset ?? null;

    const handlePickImage = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert(
                "Permission required",
                "We need access to your photo library to upload a background image.",
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [2, 1],
            quality: 0.8,
        });

        if (result.canceled || result.assets.length === 0) return;

        const asset = result.assets[0];
        if (!asset.uri) return;

        setUploading(true);
        try {
            await uploadProfileBackground(instanceUrl, accessToken, asset.uri);
            await refresh();
        } catch (error) {
            Alert.alert(
                "Upload failed",
                error instanceof Error ? error.message : "Unable to upload background image",
            );
        } finally {
            setUploading(false);
        }
    }, [instanceUrl, accessToken, refresh]);

    const handleSelectColor = useCallback(async (color: string) => {
        if (!instanceUrl || !accessToken) return;
        setSaving(true);
        try {
            await updateProfile(instanceUrl, accessToken, {
                profileBackgroundColor: color,
                profileBackgroundGradient: null,
            });
            await refresh();
        } catch (error) {
            Alert.alert(
                "Failed to update",
                error instanceof Error ? error.message : "Unable to update background",
            );
        } finally {
            setSaving(false);
        }
    }, [instanceUrl, accessToken, refresh]);

    const handleSelectGradient = useCallback(async (cssValue: string) => {
        if (!instanceUrl || !accessToken) return;
        setSaving(true);
        try {
            await updateProfile(instanceUrl, accessToken, {
                profileBackgroundGradient: cssValue,
                profileBackgroundColor: null,
            });
            await refresh();
        } catch (error) {
            Alert.alert(
                "Failed to update",
                error instanceof Error ? error.message : "Unable to update background",
            );
        } finally {
            setSaving(false);
        }
    }, [instanceUrl, accessToken, refresh]);

    const handleClear = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setSaving(true);
        try {
            await updateProfile(instanceUrl, accessToken, {
                profileBackgroundColor: null,
                profileBackgroundGradient: null,
            });
            await refresh();
        } catch (error) {
            Alert.alert(
                "Failed to clear",
                error instanceof Error ? error.message : "Unable to clear background",
            );
        } finally {
            setSaving(false);
        }
    }, [instanceUrl, accessToken, refresh]);

    const hasBackground = currentColor || currentGradient || currentImageUrl;

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
            <View
                pointerEvents="none"
                style={[styles.backdropOrbTop, { backgroundColor: "rgba(217, 121, 43, 0.08)" }]}
            />
            <View
                pointerEvents="none"
                style={[styles.backdropOrbBottom, { backgroundColor: "rgba(78, 138, 134, 0.06)" }]}
            />
            <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                <ScrollView
                    style={{ width: "100%" }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.shell}>
                        <View style={styles.header}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={styles.headerButton}
                            >
                                <ThemedText type="smallBold" themeColor="foreground">
                                    Back
                                </ThemedText>
                            </Pressable>
                            <ThemedText type="smallBold">
                                Appearance
                            </ThemedText>
                            <View style={styles.headerButton} />
                        </View>

                        {/* Current background preview */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Profile Background</ThemedText>
                            <View
                                style={[
                                    styles.previewBox,
                                    {
                                        backgroundColor: currentColor ?? theme.muted,
                                        borderColor: theme.border,
                                    },
                                ]}
                            >
                                {currentImageUrl ? (
                                    <Image
                                        source={{ uri: currentImageUrl }}
                                        style={StyleSheet.absoluteFill}
                                        resizeMode="cover"
                                    />
                                ) : null}
                            </View>
                            <View style={styles.previewActions}>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handlePickImage}
                                    disabled={uploading || saving}
                                    style={({ pressed }) => ({
                                        opacity: uploading || saving ? 0.5 : pressed ? 0.8 : 1,
                                    })}
                                >
                                    <ThemedText type="code" themeColor="accent">
                                        {uploading ? "Uploading..." : "Upload image"}
                                    </ThemedText>
                                </Pressable>
                                {hasBackground ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleClear}
                                        disabled={saving || uploading}
                                        style={({ pressed }) => ({
                                            opacity: saving || uploading ? 0.5 : pressed ? 0.8 : 1,
                                        })}
                                    >
                                        <ThemedText type="code" themeColor="destructive">
                                            Clear
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                            </View>
                        </ThemedView>

                        {/* Solid colors */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Solid Colors</ThemedText>
                            <View style={styles.colorGrid}>
                                {PRESET_COLORS.map((color) => (
                                    <Pressable
                                        key={color}
                                        accessibilityRole="button"
                                        accessibilityLabel={color}
                                        onPress={() => handleSelectColor(color)}
                                        disabled={saving || uploading}
                                        style={({ pressed }) => [
                                            styles.colorSwatch,
                                            {
                                                backgroundColor: color,
                                                borderColor: currentColor === color
                                                    ? theme.foreground
                                                    : "transparent",
                                                opacity: saving || uploading ? 0.6 : pressed ? 0.8 : 1,
                                            },
                                        ]}
                                    >
                                        {currentColor === color ? (
                                            <ThemedText
                                                style={{
                                                    fontSize: 14,
                                                    color: "#FFFFFF",
                                                    fontWeight: "700",
                                                }}
                                            >
                                                ✓
                                            </ThemedText>
                                        ) : null}
                                    </Pressable>
                                ))}
                            </View>
                        </ThemedView>

                        {/* Gradients */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Gradients</ThemedText>
                            <View style={styles.gradientGrid}>
                                {PRESET_GRADIENTS.map((gradient) => (
                                    <Pressable
                                        key={gradient.name}
                                        accessibilityRole="button"
                                        accessibilityLabel={gradient.name}
                                        onPress={() => handleSelectGradient(gradient.cssValue)}
                                        disabled={saving || uploading}
                                        style={({ pressed }) => [
                                            styles.gradientSwatch,
                                            {
                                                borderColor: currentGradient === gradient.cssValue
                                                    ? theme.foreground
                                                    : theme.border,
                                                opacity: saving || uploading ? 0.6 : pressed ? 0.8 : 1,
                                            },
                                        ]}
                                    >
                                        <LinearGradient
                                            colors={gradient.colors as [string, string, ...string[]]}
                                            style={styles.gradientPreview}
                                        />
                                        <ThemedText
                                            type="code"
                                            style={{ fontSize: 10 }}
                                            numberOfLines={1}
                                        >
                                            {gradient.name}
                                        </ThemedText>
                                    </Pressable>
                                ))}
                            </View>
                        </ThemedView>

                        {/* Avatar frames info */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Avatar Frame</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                {currentFrame
                                    ? `Current frame: ${currentFrame}`
                                    : "No frame selected. Avatar frames can be set from the web settings."}
                            </ThemedText>
                        </ThemedView>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -130,
        left: -130,
        zIndex: 0,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -160,
        bottom: 20,
        zIndex: 0,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.two,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.two,
    },
    headerButton: {
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.two,
        minWidth: 60,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    previewBox: {
        height: 100,
        borderRadius: 16,
        borderWidth: 1,
        overflow: "hidden",
    },
    previewActions: {
        flexDirection: "row",
        gap: Spacing.three,
        alignItems: "center",
    },
    colorGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    colorSwatch: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    gradientGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    gradientSwatch: {
        width: 100,
        gap: Spacing.half,
        borderWidth: 2,
        borderRadius: 12,
        padding: Spacing.one,
        alignItems: "center",
    },
    gradientPreview: {
        width: "100%",
        height: 40,
        borderRadius: 8,
    },
});
