import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import {
  authenticateWithPassword,
  extractAppwriteConfig,
  evaluateCompatibility,
  fetchAllowUserServers,
  fetchInstance,
  fetchVersion,
  normalizeInstanceUrl,
  resolveCurrentUser,
} from "@/lib/firepit/bootstrap";
import {
  clearBearerToken,
  clearFirepitPersistence,
  loadBearerToken,
  loadBootstrapSnapshot,
  loadNotificationPreferences,
  loadNotificationToken,
  loadStoredAppwriteConfig,
  loadStoredInstanceUrl,
  saveBearerToken,
  saveBootstrapSnapshot,
  saveNotificationPreferences,
  saveNotificationToken,
  saveStoredAppwriteConfig,
  saveStoredInstanceUrl,
} from "@/lib/firepit/persistence";
import type {
  BootstrapSnapshot,
  CompatibilityEvaluation,
  ConnectionState,
  CurrentUser,
  FeatureFlagState,
  InstanceMetadata,
  VersionInfo,
} from "@/lib/firepit/types";
import type { NotificationPreferences } from "@/lib/firepit/persistence";
import type { AppwriteConfig } from "@/lib/firepit/bootstrap";
type FirepitBootstrapContextValue = {
  instanceUrl: string | null;
  version: VersionInfo | null;
  instance: InstanceMetadata | null;
  state: ConnectionState;
  featureFlags: FeatureFlagState | null;
  compatibility: CompatibilityEvaluation | null;
  currentUser: CurrentUser | null;
  bearerTokenPresent: boolean;
  accessToken: string | null;
  error: string | null;
  notificationPreferences: NotificationPreferences | null;
  saveNotificationPreferences: (prefs: NotificationPreferences) => Promise<void>;
  bootstrapInstance: (
    instanceUrl: string,
  ) => Promise<CompatibilityEvaluation | null>;
  authenticate: (email: string, password: string) => Promise<void>;
  setSessionToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<CompatibilityEvaluation | null>;
  resetConnection: () => Promise<void>;
};

const FirepitBootstrapContext =
  createContext<FirepitBootstrapContextValue | null>(null);

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected Firepit error";
}

function snapshotFromState(
  instanceUrl: string,
  version: VersionInfo,
  instance: InstanceMetadata,
  featureFlags: FeatureFlagState,
  compatibility: CompatibilityEvaluation,
  currentUser: CurrentUser | null,
): BootstrapSnapshot {
  return {
    instanceUrl,
    version,
    instance,
    allowUserServers: Boolean(featureFlags.enabled),
    compatible: compatibility.compatible,
    compatibilityReason: compatibility.reason,
    currentUser,
  };
}

export function FirepitProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConnectionState>("loading");
  const [instanceUrl, setInstanceUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [instance, setInstance] = useState<InstanceMetadata | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagState | null>(
    null,
  );
  const [compatibility, setCompatibility] =
    useState<CompatibilityEvaluation | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [bearerTokenPresent, setBearerTokenPresent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appwriteConfig, setAppwriteConfig] = useState<AppwriteConfig | null>(
    null,
  );
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);

  const clearRuntimeState = useCallback(() => {
    setState("needs-instance");
    setInstanceUrl(null);
    setVersion(null);
    setInstance(null);
    setFeatureFlags(null);
    setCompatibility(null);
    setCurrentUser(null);
    setAccessToken(null);
    setBearerTokenPresent(false);
    setAppwriteConfig(null);
    setError(null);
  }, []);

  const resetConnection = useCallback(async () => {
    await clearFirepitPersistence();
    clearRuntimeState();
  }, [clearRuntimeState]);

  const persistAppwriteConfig = useCallback(
    async (instance: InstanceMetadata) => {
      const nextConfig = extractAppwriteConfig(instance);
      if (!nextConfig) {
        throw new Error(
          "Instance metadata did not include Appwrite connection details.",
        );
      }

      await saveStoredAppwriteConfig(nextConfig);
      setAppwriteConfig(nextConfig);
      return nextConfig;
    },
    [],
  );

  const resolveAppwriteConfig = useCallback(async () => {
    if (appwriteConfig) {
      return appwriteConfig;
    }

    if (!instanceUrl) {
      throw new Error("Set an instance URL first.");
    }

    const sourceInstance = instance ?? (await fetchInstance(instanceUrl));
    return persistAppwriteConfig(sourceInstance);
  }, [appwriteConfig, instance, instanceUrl, persistAppwriteConfig]);

  const refresh = useCallback(
    async (targetInstanceUrl?: string) => {
      const nextInstanceUrl = targetInstanceUrl ?? instanceUrl;
      if (!nextInstanceUrl) {
        setState("needs-instance");
        return null;
      }

      setState("loading");
      setError(null);

      try {
        const [nextVersion, nextInstance, nextFlags, nextToken] =
          await Promise.all([
            fetchVersion(nextInstanceUrl),
            fetchInstance(nextInstanceUrl),
            fetchAllowUserServers(nextInstanceUrl),
            loadBearerToken(),
          ]);
        const nextAppwriteConfig = await persistAppwriteConfig(nextInstance);

        const nextCompatibility = evaluateCompatibility(
          nextVersion,
          nextInstance,
        );
        let nextCurrentUser: CurrentUser | null = null;
        let nextState: ConnectionState = nextCompatibility.compatible
          ? "needs-auth"
          : "incompatible";

        if (nextCompatibility.compatible && nextToken) {
          try {
            nextCurrentUser = await resolveCurrentUser(
              nextInstanceUrl,
              nextToken,
              nextAppwriteConfig,
            );
            setAccessToken(nextToken);
            setBearerTokenPresent(true);
            nextState = "ready";
          } catch (authError) {
            await clearBearerToken();
            setAccessToken(null);
            setBearerTokenPresent(false);
            nextState = "needs-auth";
            setError(
              authError instanceof Error &&
                authError.message.toLowerCase().includes("not authenticated")
                ? "Session expired. Sign in again."
                : toErrorMessage(authError),
            );
          }
        } else {
          setAccessToken(null);
          setBearerTokenPresent(false);
        }

        setInstanceUrl(nextInstanceUrl);
        setVersion(nextVersion);
        setInstance(nextInstance);
        setFeatureFlags(nextFlags);
        setCompatibility(nextCompatibility);
        setCurrentUser(nextCurrentUser);
        setAppwriteConfig(nextAppwriteConfig);
        setState(nextState);

        await saveBootstrapSnapshot(
          snapshotFromState(
            nextInstanceUrl,
            nextVersion,
            nextInstance,
            nextFlags,
            nextCompatibility,
            nextCurrentUser,
          ),
        );
        return nextCompatibility;
      } catch (bootstrapError) {
        setState("error");
        setError(toErrorMessage(bootstrapError));
        return null;
      }
    },
    [instanceUrl, persistAppwriteConfig],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [
          storedInstanceUrl,
          storedSnapshot,
          storedToken,
          storedAppwriteConfig,
        ] = await Promise.all([
          loadStoredInstanceUrl().catch((e) => {
            console.error("[provider] Failed to load stored instance URL:", e);
            return null;
          }),
          loadBootstrapSnapshot().catch((e) => {
            console.error("[provider] Failed to load bootstrap snapshot:", e);
            return null;
          }),
          loadBearerToken().catch((e) => {
            console.error("[provider] Failed to load bearer token:", e);
            return null;
          }),
          loadStoredAppwriteConfig().catch((e) => {
            console.error("[provider] Failed to load appwrite config:", e);
            return null;
          }),
        ]);

        if (cancelled) {
          return;
        }

        if (storedSnapshot && storedInstanceUrl) {
          setInstanceUrl(storedInstanceUrl);
          setVersion(storedSnapshot.version);
          setInstance(storedSnapshot.instance);
          setFeatureFlags({ enabled: storedSnapshot.allowUserServers });
          setCompatibility({
            compatible: storedSnapshot.compatible,
            minimumVersion: storedSnapshot.version.version,
            reason: storedSnapshot.compatibilityReason,
          });
          setCurrentUser(storedSnapshot.currentUser);
          setAccessToken(storedToken);
          setBearerTokenPresent(Boolean(storedToken));
          setAppwriteConfig(storedAppwriteConfig);
          setState(
            storedSnapshot.compatible
              ? storedToken
                ? "ready"
                : "needs-auth"
              : "incompatible",
          );
          void refresh(storedInstanceUrl);
          return;
        }

        if (storedInstanceUrl) {
          await refresh(storedInstanceUrl);
          return;
        }

        setState("needs-instance");
      } catch (hydrateError) {
        console.error("[provider] Hydration failed:", hydrateError);
        if (!cancelled) {
          setState("error");
          setError(toErrorMessage(hydrateError));
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Register for push notifications after successful auth
  useEffect(() => {
    let cancelled = false;

    async function registerForNotifications() {
      if (state !== "ready" || !accessToken) {
        return;
      }

      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("[notifications] Permission not granted");
          return;
        }

        if (!Device.isDevice) {
          console.log("[notifications] Not a physical device, skipping token registration");
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;

        if (!cancelled) {
          await saveNotificationToken(token);
          console.log("[notifications] Registered push token:", token.slice(0, 12) + "...");
        }

        // Load persisted preferences if not already loaded
        const stored = await loadNotificationPreferences();
        if (!cancelled && stored) {
          setNotificationPreferences(stored);
        }
      } catch (error) {
        console.error("[notifications] Registration failed:", error);
      }
    }

    void registerForNotifications();

    return () => {
      cancelled = true;
    };
  }, [state, accessToken]);

  const bootstrapInstance = useCallback(
    async (nextInstanceUrl: string) => {
      const normalized = normalizeInstanceUrl(nextInstanceUrl);
      if (!normalized) {
        throw new Error("Enter an instance URL to continue.");
      }
      await saveStoredInstanceUrl(normalized);
      return refresh(normalized);
    },
    [refresh],
  );

  const setSessionToken = useCallback(
    async (token: string) => {
      if (!instanceUrl) {
        throw new Error("Set an instance URL first.");
      }
      await saveBearerToken(token);
      setAccessToken(token);
      setBearerTokenPresent(true);
      setState("loading");
      setError(null);

      try {
        const nextUser = await resolveCurrentUser(
          instanceUrl,
          token,
          appwriteConfig ?? (await resolveAppwriteConfig()),
        );
        setCurrentUser(nextUser);
        setState("ready");

        if (version && instance && featureFlags && compatibility) {
          await saveBootstrapSnapshot(
            snapshotFromState(
              instanceUrl,
              version,
              instance,
              featureFlags,
              compatibility,
              nextUser,
            ),
          );
        }
      } catch (authError) {
        await clearBearerToken();
        setAccessToken(null);
        setBearerTokenPresent(false);
        setCurrentUser(null);
        setState("needs-auth");
        setError(
          authError instanceof Error &&
            authError.message.toLowerCase().includes("not authenticated")
            ? "Session expired. Sign in again."
            : toErrorMessage(authError),
        );
        throw authError;
      }
    },
    [compatibility, featureFlags, instance, instanceUrl, version],
  );

  const authenticate = useCallback(
    async (email: string, password: string) => {
      const config = await resolveAppwriteConfig();
      const token = await authenticateWithPassword(email, password, config);
      await setSessionToken(token);
    },
    [resolveAppwriteConfig, setSessionToken],
  );

  const signOut = useCallback(async () => {
    await clearBearerToken();
    setAccessToken(null);
    setBearerTokenPresent(false);
    setCurrentUser(null);
    setError(null);
    setState(instanceUrl ? "needs-auth" : "needs-instance");

    if (instanceUrl && version && instance && featureFlags && compatibility) {
      await saveBootstrapSnapshot(
        snapshotFromState(
          instanceUrl,
          version,
          instance,
          featureFlags,
          compatibility,
          null,
        ),
      );
    }
  }, [compatibility, featureFlags, instance, instanceUrl, version]);

  const saveNotifPrefs = useCallback(
    async (prefs: NotificationPreferences) => {
      await saveNotificationPreferences(prefs);
      setNotificationPreferences(prefs);
    },
    [],
  );

  const value = useMemo<FirepitBootstrapContextValue>(
    () => ({
      state,
      instanceUrl,
      version,
      instance,
      featureFlags,
      compatibility,
      currentUser,
      bearerTokenPresent,
      accessToken,
      error,
      notificationPreferences,
      saveNotificationPreferences: saveNotifPrefs,
      bootstrapInstance,
      authenticate,
      setSessionToken,
      signOut,
      resetConnection,
      refresh: async () => refresh(instanceUrl ?? undefined),
    }),
    [
      authenticate,
      bearerTokenPresent,
      bootstrapInstance,
      compatibility,
      currentUser,
      error,
      featureFlags,
      accessToken,
      instance,
      instanceUrl,
      notificationPreferences,
      refresh,
      resetConnection,
      saveNotifPrefs,
      setSessionToken,
      signOut,
      state,
      version,
    ],
  );

  return (
    <FirepitBootstrapContext.Provider value={value}>
      {children}
    </FirepitBootstrapContext.Provider>
  );
}

export function useFirepitBootstrap() {
  const context = useContext(FirepitBootstrapContext);
  if (!context) {
    throw new Error("useFirepitBootstrap must be used within FirepitProvider");
  }
  return context;
}
