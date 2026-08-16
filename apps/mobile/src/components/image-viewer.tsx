import React from "react";
import { Modal, View, Image, Pressable } from "react-native";
import { useTheme } from "@/hooks/use-theme";

export function ImageViewer({ url, visible, onClose }: { url?: string | null; visible: boolean; onClose: () => void }) {
  const colors = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        {url ? (
          <Image source={{ uri: url }} style={{ width: "90%", height: "70%", resizeMode: "contain" }} />
        ) : null}
      </View>
    </Modal>
  );
}

export default ImageViewer;
