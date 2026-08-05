import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";
import { cacheManager } from "@/lib/cache/CacheManager";

type CacheState = {
  requestedUri: string;
  cachedUri: string | null;
  loadFailed: boolean;
};

const EMPTY_CACHE_STATE: CacheState = {
  requestedUri: "",
  cachedUri: null,
  loadFailed: false,
};

export function Avatar({
  uri,
  size = 40,
  initials,
  frameUrl,
  frameInset = 12,
}: {
  uri?: string | null;
  size?: number;
  initials?: string;
  frameUrl?: string;
  frameInset?: number; // percentage 0-35
}) {
  const colors = useTheme();
  const [cacheState, setCacheState] = useState<CacheState>(EMPTY_CACHE_STATE);

  useEffect(() => {
    const requested = uri?.trim() ?? "";
    setCacheState({ requestedUri: requested, cachedUri: null, loadFailed: false });

    if (!requested || !cacheManager.shouldCacheProfilePictures()) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const cached = await cacheManager.getCachedImage(requested);
        if (cancelled) return;
        if (cached) {
          setCacheState((prev) =>
            prev.requestedUri === requested ? { ...prev, cachedUri: cached } : prev,
          );
          return;
        }
        const downloaded = await cacheManager.cacheImage(requested);
        if (!cancelled) {
          setCacheState((prev) =>
            prev.requestedUri === requested ? { ...prev, cachedUri: downloaded } : prev,
          );
        }
      } catch {
        // Leave cachedUri null for the fresh URI; nothing to reset here.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const requestedUri = uri?.trim() ?? "";
  const stateMatches = cacheState.requestedUri === requestedUri;
  const sourceUri =
    stateMatches && cacheState.cachedUri ? cacheState.cachedUri : uri;
  const loadFailed = stateMatches && cacheState.loadFailed;

  const hasFrame = Boolean(frameUrl && frameUrl.length > 0);
  const frameInsetClamped = Math.max(0, Math.min(frameInset, 35));
  const insetPx = hasFrame ? Math.round((size * frameInsetClamped) / 100) : 0;
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
        onError={() =>
          setCacheState((prev) =>
            prev.requestedUri === requestedUri ? { ...prev, loadFailed: true } : prev,
          )
        }
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

  if (frameUrl) {
    return (
      <View style={{ width: size, height: size }}>
        {/* Frame image — fills entire container */}
        <Image
          source={{ uri: frameUrl }}
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
