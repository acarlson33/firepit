import { Platform } from "react-native";
import * as Device from "expo-device";

export type CpuArch = "arm64-v8a" | "armeabi-v7a" | "x86_64" | "universal";

const ARCH_MAP: Record<string, CpuArch> = {
  "arm64-v8a": "arm64-v8a",
  "armeabi-v7a": "armeabi-v7a",
  "armeabi": "armeabi-v7a",
  "x86_64": "x86_64",
  "x86": "x86_64",
};

export function getDeviceCpuArch(): CpuArch {
  if (Platform.OS !== "android") return "universal";
  const supported = Device.supportedCpuArchitectures;
  if (!supported || supported.length === 0) return "universal";
  for (const arch of supported) {
    const mapped = ARCH_MAP[arch];
    if (mapped) return mapped;
  }
  return "universal";
}
