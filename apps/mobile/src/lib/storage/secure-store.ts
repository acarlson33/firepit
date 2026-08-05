import { Platform } from "react-native";

import * as SecureStore from "expo-secure-store";

const storagePrefix = "firepit-reactnative.";

// In-memory cache to avoid repeated native keychain calls.
// The native keychain can hang on subsequent reads within the same session.
const memoryCache = new Map<string, string | null>();

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

  if (memoryCache.has(storedKey)) {
    return memoryCache.get(storedKey) ?? null;
  }

  if (Platform.OS === "web") {
    const value = globalThis.localStorage?.getItem(storedKey) ?? null;
    memoryCache.set(storedKey, value);
    return value;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return null;
    }

    const value = await SecureStore.getItemAsync(storedKey, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    memoryCache.set(storedKey, value);
    return value;
  } catch {
    return null;
  }
}

export async function setSecureItem(key: string, value: string) {
  const storedKey = prefixedKey(key);
  memoryCache.set(storedKey, value);

  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(storedKey, value);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return;
    }

    await SecureStore.setItemAsync(storedKey, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Memory cache already updated.
  }
}

export async function deleteSecureItem(key: string) {
  const storedKey = prefixedKey(key);
  memoryCache.delete(storedKey);

  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(storedKey);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return;
    }

    await SecureStore.deleteItemAsync(storedKey);
  } catch {
    // Memory cache already cleared.
  }
}

// JSON value storage — wraps the raw secure-store with JSON serialization.

const jsonPrefix = "firepit-reactnative.json.";

function jsonKey(key: string) {
  return `${jsonPrefix}${key}`;
}

export async function setJsonValue(key: string, value: unknown) {
  const storedKey = jsonKey(key);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    await deleteJsonValue(key);
    return;
  }
  memoryCache.set(storedKey, serialized);

  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(storedKey, serialized);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return;
    }

    await SecureStore.setItemAsync(storedKey, serialized, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    // Memory cache already updated.
  }
}

export async function getJsonValue<T>(key: string): Promise<T | null> {
  const storedKey = jsonKey(key);

  if (memoryCache.has(storedKey)) {
    const raw = memoryCache.get(storedKey) ?? null;
    return raw ? (JSON.parse(raw) as T) : null;
  }

  if (Platform.OS === "web") {
    const raw = globalThis.localStorage?.getItem(storedKey) ?? null;
    memoryCache.set(storedKey, raw);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return null;
    }

    const raw = await SecureStore.getItemAsync(storedKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    memoryCache.set(storedKey, raw);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteJsonValue(key: string) {
  const storedKey = jsonKey(key);
  memoryCache.delete(storedKey);

  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(storedKey);
    return;
  }

  try {
    if (!(await isNativeSecureStoreAvailable())) {
      return;
    }

    await SecureStore.deleteItemAsync(storedKey);
  } catch {
    // Memory cache already cleared.
  }
}

export async function clearJsonStorage() {
  const keysToDelete: string[] = [];

  if (Platform.OS === "web" && globalThis.localStorage) {
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const k = globalThis.localStorage.key(i);
      if (k && k.startsWith(jsonPrefix)) {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach((k) => globalThis.localStorage?.removeItem(k));
  }

  // Clear from memory cache any keys we know about
  for (const k of memoryCache.keys()) {
    if (k.startsWith(jsonPrefix)) {
      memoryCache.delete(k);
      keysToDelete.push(k);
    }
  }

  // On native, we can't enumerate SecureStore keys, so delete known ones
  if (Platform.OS !== "web") {
    if (!(await isNativeSecureStoreAvailable())) return;
    await Promise.all(
      keysToDelete.map(async (k) => {
        try {
          await SecureStore.deleteItemAsync(k);
        } catch {
          // Best effort.
        }
      }),
    );
  }
}
