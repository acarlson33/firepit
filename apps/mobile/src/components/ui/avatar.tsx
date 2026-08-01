import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";
import { cacheManager } from "@/lib/cache/CacheManager";

type AvatarProps = {
  uri?: string | null;
  size?: number;
  initials?: string;
  frameUrl?: string;
  frameInset?: number; // percentage 0-35
};

export function Avatar({
  uri,
  size = 40,
  initials,
  frameUrl,
  frameInset = 12,
}: AvatarProps) {
  const colors = useTheme();
  const [loadFailed, setLoadFailed] = useState(false);
  const [cachedUri, setCachedUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!uri || uri.trim() === "") {
      setCachedUri(null);
      return;
    }
    if (!cacheManager.shouldCacheProfilePictures()) return;

    (async () => {
      try {
        const cached = await cacheManager.getCachedImage(uri);
        if (cached) {
          if (!cancelled) setCachedUri(cached);
          return;
        }
        const downloaded = await cacheManager.cacheImage(uri);
        if (!cancelled) setCachedUri(downloaded);
      } catch {
        if (!cancelled) setCachedUri(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const sourceUri = cachedUri || uri;

  const hasFrame = Boolean(frameUrl && frameUrl.length > 0);
  const insetPx = hasFrame ? Math.round((size * Math.min(frameInset, 35)) / 100) : 0;
  const innerSize = Math.max(0, size - insetPx * 2);

  const getInitials = (): string => {
    if (!initials) return "?";
    const trimmed = initials.trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  const avatarContent =
    sourceUri && sourceUri.trim() !== "" && !loadFailed ? (
      <Image
        source={{ uri: sourceUri }}
        style={{ width: innerSize, height: innerSize }}
        contentFit="cover"
        transition={150}
        onError={() => setLoadFailed(true)}
      />
    ) : (
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: colors.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: innerSize * 0.38,
            fontWeight: "600",
          }}
        >
          {getInitials()}
        </Text>
      </View>
    );

  if (hasFrame) {
    return (
      <View style={{ width: size, height: size }}>
        {/* Frame image — fills entire container */}
        <Image
          source={{ uri: frameUrl!}}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
        />
        {/* Avatar inset within frame */}
        <View
          style={{
            position: "absolute",
            left: insetPx,
            top: insetPx,
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            overflow: "hidden",
          }}
        >
          {avatarContent}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
    >
      {avatarContent}
    </View>
  );
}

export default Avatar;
