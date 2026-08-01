import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import {
    updateProfile,
    uploadAvatar,
    removeAvatar,
} from "@/lib/firepit/profiles";

export default function ProfileSettingsScreen() {
    const theme = useTheme();
    const { currentUser, instanceUrl, accessToken, refresh, state } =
        useFirepitBootstrap();

    const [displayName, setDisplayName] = useState(
        currentUser?.displayName ?? "",
    );
    const [pronouns, setPronouns] = useState(
        currentUser?.pronouns ?? "",
    );
    const [bio, setBio] = useState(currentUser?.bio ?? "");
    const [location, setLocation] = useState(currentUser?.location ?? "");
    const [website, setWebsite] = useState(currentUser?.website ?? "");
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const currentAvatarUrl = currentUser?.avatarUrl ?? null;

    const hasChanges =
        displayName !== (currentUser?.displayName ?? "") ||
        pronouns !== (currentUser?.pronouns ?? "") ||
        bio !== (currentUser?.bio ?? "") ||
        location !== (currentUser?.location ?? "") ||
        website !== (currentUser?.website ?? "");

    const handleSave = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setSaving(true);
        try {
            await updateProfile(instanceUrl, accessToken, {
                displayName: displayName.trim(),
                pronouns: pronouns.trim(),
                bio: bio.trim(),
                location: location.trim(),
                website: website.trim(),
            });
            await refresh();
            router.back();
        } catch (error) {
            Alert.alert(
                "Failed to save",
                error instanceof Error
                    ? error.message
                    : "Unable to update profile",
            );
        } finally {
            setSaving(false);
        }
    }, [instanceUrl, accessToken, displayName, pronouns, bio, refresh]);

    const handlePickAvatar = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;

        const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert(
                "Permission required",
                "Grant media library access to change your avatar.",
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (result.canceled || !result.assets[0]) return;

        setUploadingAvatar(true);
        try {
            await uploadAvatar(
                instanceUrl,
                accessToken,
                result.assets[0].uri,
            );
            await refresh();
        } catch (error) {
            Alert.alert(
                "Upload failed",
                error instanceof Error
                    ? error.message
                    : "Unable to upload avatar",
            );
        } finally {
            setUploadingAvatar(false);
        }
    }, [instanceUrl, accessToken, refresh]);

    const handleRemoveAvatar = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;

        Alert.alert(
            "Remove avatar",
            "Are you sure you want to remove your profile picture?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await removeAvatar(instanceUrl, accessToken);
                            await refresh();
                        } catch (error) {
                            Alert.alert(
                                "Failed to remove avatar",
                                error instanceof Error
                                    ? error.message
                                    : "Unable to remove avatar",
                            );
                        }
                    },
                },
            ],
        );
    }, [instanceUrl, accessToken, refresh]);

    const disabled =
        state !== "ready" || saving || uploadingAvatar;

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbTop,
                    { backgroundColor: "rgba(217, 121, 43, 0.08)" },
                ]}
            />
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbBottom,
                    { backgroundColor: "rgba(78, 138, 134, 0.06)" },
                ]}
            />
            <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                <ScrollView
                    style={{ width: "100%" }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.shell}>
                        {/* Header */}
                        <View style={styles.header}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={styles.headerButton}
                            >
                                <ThemedText type="smallBold" themeColor="foreground">
                                    Cancel
                                </ThemedText>
                            </Pressable>
                            <ThemedText type="smallBold">
                                Edit Profile
                            </ThemedText>
                            <Pressable
                                accessibilityRole="button"
                                onPress={handleSave}
                                disabled={disabled || !hasChanges}
                                style={({ pressed }) => [
                                    styles.headerButton,
                                    {
                                        opacity:
                                            disabled || !hasChanges
                                                ? 0.4
                                                : pressed
                                                  ? 0.8
                                                  : 1,
                                    },
                                ]}
                            >
                                {saving ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={theme.accent}
                                    />
                                ) : (
                                    <ThemedText
                                        type="smallBold"
                                        themeColor="foreground"
                                    >
                                        Save
                                    </ThemedText>
                                )}
                            </Pressable>
                        </View>

                        {/* Avatar section */}
                        <View style={styles.avatarSection}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={handlePickAvatar}
                                disabled={disabled}
                                style={({ pressed }) => ({
                                    opacity: pressed ? 0.8 : 1,
                                })}
                            >
                                {uploadingAvatar ? (
                                    <View
                                        style={[
                                            styles.avatarPlaceholder,
                                            {
                                                backgroundColor: theme.muted,
                                                borderColor: theme.border,
                                            },
                                        ]}
                                    >
                                        <ActivityIndicator
                                            color={theme.primary}
                                        />
                                    </View>
                                ) : currentAvatarUrl ? (
                                    <Image
                                        source={{ uri: currentAvatarUrl }}
                                        style={styles.avatarImage}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                ) : (
                                    <View
                                        style={[
                                            styles.avatarPlaceholder,
                                            {
                                                backgroundColor: theme.muted,
                                                borderColor: theme.border,
                                            },
                                        ]}
                                    >
                                        <ThemedText
                                            type="title"
                                            themeColor="mutedForeground"
                                        >
                                            {(
                                                currentUser?.displayName ??
                                                currentUser?.userName ??
                                                "?"
                                            ).charAt(0)
                                                .toUpperCase()}
                                        </ThemedText>
                                    </View>
                                )}
                            </Pressable>
                            <ThemedText type="smallBold">
                                {currentUser?.displayName ??
                                    currentUser?.userName ??
                                    "User"}
                            </ThemedText>
                            {currentAvatarUrl ? (
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handleRemoveAvatar}
                                    disabled={disabled}
                                >
                                    <ThemedText
                                        type="code"
                                        themeColor="destructive"
                                    >
                                        Remove avatar
                                    </ThemedText>
                                </Pressable>
                            ) : null}
                        </View>

                        {/* Form fields */}
                        <View style={styles.formSection}>
                            <View style={styles.fieldGroup}>
                                <ThemedText type="smallBold">
                                    Display name
                                </ThemedText>
                                <TextInput
                                    value={displayName}
                                    onChangeText={setDisplayName}
                                    placeholder="Your display name"
                                    placeholderTextColor={theme.mutedForeground}
                                    style={[
                                        styles.input,
                                        {
                                            color: theme.foreground,
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                        },
                                    ]}
                                    autoCapitalize="words"
                                    returnKeyType="next"
                                />
                            </View>

                            <View style={styles.fieldGroup}>
                                <ThemedText type="smallBold">
                                    Pronouns
                                </ThemedText>
                                <TextInput
                                    value={pronouns}
                                    onChangeText={setPronouns}
                                    placeholder="e.g. they/them"
                                    placeholderTextColor={theme.mutedForeground}
                                    style={[
                                        styles.input,
                                        {
                                            color: theme.foreground,
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                        },
                                    ]}
                                    autoCapitalize="none"
                                    returnKeyType="next"
                                />
                            </View>

                            <View style={styles.fieldGroup}>
                                <ThemedText type="smallBold">Bio</ThemedText>
                                <TextInput
                                    value={bio}
                                    onChangeText={setBio}
                                    placeholder="Tell us about yourself"
                                    placeholderTextColor={theme.mutedForeground}
                                    style={[
                                        styles.textArea,
                                        {
                                            color: theme.foreground,
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                        },
                                    ]}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={styles.fieldGroup}>
                                <ThemedText type="smallBold">Location</ThemedText>
                                <TextInput
                                    value={location}
                                    onChangeText={setLocation}
                                    placeholder="e.g. San Francisco, CA"
                                    placeholderTextColor={theme.mutedForeground}
                                    style={[
                                        styles.input,
                                        {
                                            color: theme.foreground,
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                        },
                                    ]}
                                    autoCapitalize="words"
                                    returnKeyType="next"
                                />
                            </View>

                            <View style={styles.fieldGroup}>
                                <ThemedText type="smallBold">Website</ThemedText>
                                <TextInput
                                    value={website}
                                    onChangeText={setWebsite}
                                    placeholder="https://example.com"
                                    placeholderTextColor={theme.mutedForeground}
                                    style={[
                                        styles.input,
                                        {
                                            color: theme.foreground,
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                        },
                                    ]}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                    returnKeyType="done"
                                />
                            </View>
                        </View>

                        {/* Save button */}
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleSave}
                            disabled={disabled || !hasChanges}
                            style={({ pressed }) => [
                                styles.saveButton,
                                {
                                    backgroundColor: theme.accent,
                                    opacity:
                                        disabled || !hasChanges
                                            ? 0.4
                                            : pressed
                                              ? 0.9
                                              : 1,
                                },
                            ]}
                        >
                            <ThemedText
                                type="smallBold"
                                themeColor="foreground"
                                style={styles.saveButtonText}
                            >
                                {saving ? "Saving..." : "Save Changes"}
                            </ThemedText>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
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
    },
    avatarSection: {
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.three,
    },
    avatarImage: {
        width: 96,
        height: 96,
        borderRadius: 48,
    },
    avatarPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
    },
    formSection: {
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: Spacing.two,
        gap: Spacing.three,
    },
    fieldGroup: {
        gap: Spacing.one,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        fontSize: 15,
        lineHeight: 20,
    },
    textArea: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        fontSize: 15,
        lineHeight: 20,
        minHeight: 100,
    },
    saveButton: {
        borderRadius: 12,
        paddingVertical: Spacing.three,
        alignItems: "center",
    },
    saveButtonText: {
        fontSize: 15,
    },
});
