import { Platform } from "react-native";

import * as SecureStore from "expo-secure-store";

const storagePrefix = "firepit-reactnative.sqlite.";
const webStorePrefix = storagePrefix;
const fallbackStore = new Map<string, string>();
const trackedKeys = new Set<string>();

function storageNotSupported() {
  return Platform.OS === "web";
}

function prefixedKey(key: string) {
  return `${storagePrefix}${key}`;
}

async function isNativeSecureStoreAvailable() {
  if (Platform.OS === "web") {
    return false;
  }
  return SecureStore.isAvailableAsync();
}

export async function setJsonValue(key: string, value: unknown) {
  if (storageNotSupported()) {
    const storedKey = prefixedKey(key);
    const serializedValue = JSON.stringify(value);
    fallbackStore.set(storedKey, serializedValue);
    globalThis.localStorage?.setItem(storedKey, serializedValue);
    return;
  }
  const storedKey = prefixedKey(key);
  const serializedValue = JSON.stringify(value);

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      fallbackStore.set(storedKey, serializedValue);
      trackedKeys.add(storedKey);
      return;
    }

    await SecureStore.setItemAsync(storedKey, serializedValue, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    trackedKeys.add(storedKey);
  } catch (error) {
    console.error("[sqlite] Failed to set value, using fallback store:", error);
    fallbackStore.set(storedKey, serializedValue);
    trackedKeys.add(storedKey);
  }
}

export async function getJsonValue<T>(key: string): Promise<T | null> {
  if (storageNotSupported()) {
    const storedKey = prefixedKey(key);
    const serializedValue =
      globalThis.localStorage?.getItem(storedKey) ??
      fallbackStore.get(storedKey) ??
      null;
    return serializedValue ? (JSON.parse(serializedValue) as T) : null;
  }

  const storedKey = prefixedKey(key);

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      const fallbackValue = fallbackStore.get(storedKey) ?? null;
      return fallbackValue ? (JSON.parse(fallbackValue) as T) : null;
    }

    const value = await SecureStore.getItemAsync(storedKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.error(
      "[sqlite] Failed to get value, checking fallback store:",
      error,
    );
    const fallbackValue = fallbackStore.get(storedKey);
    return fallbackValue ? (JSON.parse(fallbackValue) as T) : null;
  }
}

export async function deleteJsonValue(key: string) {
  if (storageNotSupported()) {
    const storedKey = prefixedKey(key);
    fallbackStore.delete(storedKey);
    globalThis.localStorage?.removeItem(storedKey);
    return;
  }

  const storedKey = prefixedKey(key);

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      fallbackStore.delete(storedKey);
      trackedKeys.delete(storedKey);
      return;
    }

    await SecureStore.deleteItemAsync(storedKey);
    trackedKeys.delete(storedKey);
  } catch (error) {
    console.error("[sqlite] Failed to delete value:", error);
    fallbackStore.delete(storedKey);
    trackedKeys.delete(storedKey);
  }
}

export async function clearJsonStorage() {
  if (storageNotSupported()) {
    fallbackStore.clear();
    if (globalThis.localStorage) {
      const keysToRemove: string[] = [];
      for (let index = 0; index < globalThis.localStorage.length; index += 1) {
        const key = globalThis.localStorage.key(index);
        if (key && key.startsWith(webStorePrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => globalThis.localStorage?.removeItem(key));
    }
    return;
  }
  try {
    for (const storedKey of trackedKeys) {
      if (await isNativeSecureStoreAvailable()) {
        await SecureStore.deleteItemAsync(storedKey);
      }
    }
    trackedKeys.clear();
  } catch (error) {
    console.error("[sqlite] Failed to clear storage:", error);
    fallbackStore.clear();
    trackedKeys.clear();
  }
}
