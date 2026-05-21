import type { BootstrapSnapshot } from "@/lib/firepit/types";
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from "@/lib/storage/secure-store";
import {
  clearJsonStorage,
  deleteJsonValue,
  getJsonValue,
  setJsonValue,
} from "@/lib/storage/sqlite";

const keys = {
  instanceUrl: "firepit.instance-url",
  bootstrapSnapshot: "firepit.bootstrap-snapshot",
  bearerToken: "firepit.bearer-token",
  appwriteConfig: "firepit.appwrite-config",
} as const;

export async function loadStoredInstanceUrl() {
  return getJsonValue<string>(keys.instanceUrl);
}

export async function saveStoredInstanceUrl(instanceUrl: string) {
  await setJsonValue(keys.instanceUrl, instanceUrl);
}

export async function clearStoredInstanceUrl() {
  await deleteJsonValue(keys.instanceUrl);
}

export async function loadBootstrapSnapshot() {
  return getJsonValue<BootstrapSnapshot>(keys.bootstrapSnapshot);
}

export async function saveBootstrapSnapshot(snapshot: BootstrapSnapshot) {
  await setJsonValue(keys.bootstrapSnapshot, snapshot);
}

export async function clearBootstrapSnapshot() {
  await deleteJsonValue(keys.bootstrapSnapshot);
}

export async function loadStoredAppwriteConfig() {
  return getJsonValue<{ endpoint: string; project: string }>(
    keys.appwriteConfig,
  );
}

export async function saveStoredAppwriteConfig(config: {
  endpoint: string;
  project: string;
}) {
  await setJsonValue(keys.appwriteConfig, config);
}

export async function clearStoredAppwriteConfig() {
  await deleteJsonValue(keys.appwriteConfig);
}

export async function loadBearerToken() {
  const token = await getSecureItem(keys.bearerToken);
  console.log("[persistence] loadBearerToken - token present:", !!token, "token length:", token?.length ?? 0, "stored key:", keys.bearerToken);
  return token;
}

export async function saveBearerToken(token: string) {
  console.log("[persistence] saveBearerToken - saving token length:", token?.length ?? 0, "stored key:", keys.bearerToken);
  await setSecureItem(keys.bearerToken, token);
  const verify = await getSecureItem(keys.bearerToken);
  console.log("[persistence] saveBearerToken - verify after save - token present:", !!verify, "length:", verify?.length ?? 0);
}

export async function clearBearerToken() {
  await deleteSecureItem(keys.bearerToken);
}

export async function clearFirepitPersistence() {
  await Promise.all([
    clearStoredInstanceUrl(),
    clearBootstrapSnapshot(),
    clearStoredAppwriteConfig(),
    clearBearerToken(),
  ]);
  await clearJsonStorage();
}
