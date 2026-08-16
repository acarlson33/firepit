import { Platform } from "react-native";

import * as SecureStore from "expo-secure-store";

const storagePrefix = "firepit-reactnative.";
const fallbackStore = new Map<string, string>();

async function isNativeSecureStoreAvailable() {
  if (Platform.OS === "web") {
    return false;
  }
  return SecureStore.isAvailableAsync();
}

function prefixedKey(key: string) {
  return `${storagePrefix}${key}`;
}

export async function getSecureItem(key: string) {
  const storedKey = prefixedKey(key);
  if (Platform.OS === "web") {
    const value = globalThis.localStorage?.getItem(storedKey) ?? null;
    console.log(
      "[secure-store] getSecureItem (web/localStorage)",
      "key:",
      storedKey,
      "present:",
      !!value,
      "length:",
      value?.length ?? 0,
    );
    return value;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      const value = fallbackStore.get(storedKey) ?? null;
      console.log(
        "[secure-store] getSecureItem (fallback)",
        "key:",
        storedKey,
        "present:",
        !!value,
      );
      return value;
    }

    const value = await SecureStore.getItemAsync(storedKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    console.log(
      "[secure-store] getSecureItem (native)",
      "key:",
      storedKey,
      "present:",
      !!value,
    );
    return value;
  } catch (error) {
    console.error(
      "[secure-store] getSecureItem failed, falling back to memory:",
      error,
    );
    return fallbackStore.get(storedKey) ?? null;
  }
}

export async function setSecureItem(key: string, value: string) {
  const storedKey = prefixedKey(key);
  if (Platform.OS === "web") {
    console.log(
      "[secure-store] setSecureItem (web/localStorage)",
      "key:",
      storedKey,
      "value length:",
      value?.length ?? 0,
    );
    globalThis.localStorage?.setItem(storedKey, value);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      console.log("[secure-store] setSecureItem (fallback)", "key:", storedKey);
      fallbackStore.set(storedKey, value);
      return;
    }

    console.log("[secure-store] setSecureItem (native)", "key:", storedKey);
    await SecureStore.setItemAsync(storedKey, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch (error) {
    console.error(
      "[secure-store] setSecureItem failed, falling back to memory:",
      error,
    );
    fallbackStore.set(storedKey, value);
  }
}

export async function deleteSecureItem(key: string) {
  const storedKey = prefixedKey(key);
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(storedKey);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      fallbackStore.delete(storedKey);
      return;
    }

    await SecureStore.deleteItemAsync(storedKey);
  } catch (error) {
    console.error("[secure-store] deleteSecureItem failed:", error);
    fallbackStore.delete(storedKey);
  }
}
