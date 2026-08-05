import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";

export function ImageViewer({ url, visible, onClose }: { url?: string | null; visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [url]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        {url ? (
          <>
            <Image
              source={{ uri: url }}
              style={{ width: "90%", height: "70%" }}
              contentFit="contain"
              onLoad={() => {
                setLoading(false);
                setFailed(false);
              }}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              cachePolicy="memory-disk"
            />
            {loading ? (
              <ActivityIndicator
                style={{ position: "absolute" }}
                color={colors.foreground}
                size="large"
              />
            ) : null}
            {failed ? (
              <Text style={{ position: "absolute", color: colors.textSecondary }}>
                Failed to load image
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

export default ImageViewer;
