import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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
  loadStoredAppwriteConfig,
  loadStoredInstanceUrl,
  saveBearerToken,
  saveBootstrapSnapshot,
  saveNotificationPreferences,
  saveStoredAppwriteConfig,
  saveStoredInstanceUrl,
} from "@/lib/firepit/persistence";
import { FirepitHttpError } from "@/lib/firepit/http";
import {
  clearCredentials,
  loadCredentials,
  storeCredentials,
} from "@/lib/credential-store";
import {
  fetchCustomEmojis,
  listInboxDigest,
  markInboxContextRead,
} from "@/lib/firepit/messages";
import { clearDmEncryptionKeyPairs } from "@/lib/firepit/dm-encryption";
import { clearProfileCache } from "@/lib/profile-cache";
import { resetServerCache } from "@/lib/server-cache";
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
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/firepit/persistence";
import type { AppwriteConfig } from "@/lib/firepit/bootstrap";

import type { CustomEmoji } from "@/components/emoji-renderer";
import { registerPushToken, usePushNotificationHandler } from "@/hooks/use-push-notifications";

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
  appwriteConfig: AppwriteConfig | null;
  notificationPreferences: NotificationPreferences | null;
  customEmojis: CustomEmoji[];
  saveNotificationPreferences: (prefs: NotificationPreferences) => Promise<void>;
  bootstrapInstance: (
    instanceUrl: string,
  ) => Promise<CompatibilityEvaluation | null>;
  authenticate: (email: string, password: string) => Promise<void>;
  authenticateWithStoredCredentials: () => Promise<boolean>;
  setSessionToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<CompatibilityEvaluation | null>;
  resetConnection: () => Promise<void>;
};

const FirepitBootstrapContext =
  createContext<FirepitBootstrapContextValue | null>(null);

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected Firepit error";
}

function isJwtExpired(token: string, bufferSeconds = 300): boolean {
  try {
    const part = token.split(".")[1];
    if (!part) return false;
    const base64 = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    if (typeof payload.exp === "number") {
      return payload.exp * 1000 < Date.now() + bufferSeconds * 1000;
    }
    return false;
  } catch {
    return false;
  }
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagState | null>(null);
  const [compatibility, setCompatibility] =
    useState<CompatibilityEvaluation | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [bearerTokenPresent, setBearerTokenPresent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appwriteConfig, setAppwriteConfig] = useState<AppwriteConfig | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);

  // Handle push notification taps — navigates to the relevant message
  usePushNotificationHandler();

  // Fetch custom emojis when instanceUrl and accessToken are available
  const fetchCustomEmojisCallback = useCallback(async () => {
    if (!instanceUrl || !accessToken) return;
    try {
      const emojis = await fetchCustomEmojis(instanceUrl, accessToken);
      setCustomEmojis(emojis);
    } catch {
      // Silently fail — custom emojis are non-critical
    }
  }, [instanceUrl, accessToken]);

  // Refs that mirror state so callbacks always read the latest value
  // without needing the state in their dependency arrays.
  const instanceUrlRef = useRef(instanceUrl);
  useEffect(() => {
    instanceUrlRef.current = instanceUrl;
  }, [instanceUrl]);

  const appwriteConfigRef = useRef(appwriteConfig);
  useEffect(() => {
    appwriteConfigRef.current = appwriteConfig;
  }, [appwriteConfig]);

  // Guard against setState after unmount (e.g. timer fires during navigation)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch custom emojis when instance is available
  useEffect(() => {
    if (state === "ready") {
      void fetchCustomEmojisCallback();
    }
  }, [state, fetchCustomEmojisCallback]);

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
    clearProfileCache();
    clearDmEncryptionKeyPairs();
    resetServerCache();
    clearRuntimeState();
  }, [clearRuntimeState]);

  const persistAppwriteConfig = useCallback(
    async (inst: InstanceMetadata) => {
      const nextConfig = extractAppwriteConfig(inst);
      if (!nextConfig) {
        throw new Error("Instance metadata did not include Appwrite connection details.");
      }
      await saveStoredAppwriteConfig(nextConfig);
      setAppwriteConfig(nextConfig);
      return nextConfig;
    },
    [],
  );

  // resolveAppwriteConfig reads instanceUrl from ref so it never needs to be recreated
  const resolveAppwriteConfig = useCallback(async () => {
    if (appwriteConfigRef.current) return appwriteConfigRef.current;
    const url = instanceUrlRef.current;
    if (!url) throw new Error("Set an instance URL first.");
    const sourceInstance = instance ?? (await fetchInstance(url));
    return persistAppwriteConfig(sourceInstance);
  }, [instance, persistAppwriteConfig]);

  // Silent re-auth: reads instanceUrl from ref, calls setSessionToken
  const authenticateWithStoredCredentials = useCallback(async (): Promise<boolean> => {
    try {
      const stored = await loadCredentials();
      if (!stored) return false;

      const url = instanceUrlRef.current;
      if (!url) return false;
      const config = await resolveAppwriteConfig();
      const token = await authenticateWithPassword(stored.email, stored.password, url, config);

      // setSessionToken reads instanceUrl from ref internally
      await saveBearerToken(token);
      setAccessToken(token);
      setBearerTokenPresent(true);
      setState("loading");
      setError(null);

      try {
        const nextUser = await resolveCurrentUser(url, token, config);
        setCurrentUser(nextUser);
        setState("ready");
        if (version && instance && featureFlags && compatibility) {
          await saveBootstrapSnapshot(
            snapshotFromState(url, version, instance, featureFlags, compatibility, nextUser),
          );
        }
      } catch (authError) {
        await clearBearerToken();
        setAccessToken(null);
        setBearerTokenPresent(false);
        setCurrentUser(null);
        setState("needs-auth");
        setError("Session expired. Sign in again.");
        throw authError;
      }

      return true;
    } catch (err) {
      console.error("[provider] Silent re-authentication failed:", err);
      return false;
    }
  }, [resolveAppwriteConfig, version, instance, featureFlags, compatibility]);

  // refresh: reads instanceUrl from ref, no state deps -> stable identity
  const refresh = useCallback(
    async (targetInstanceUrl?: string, background?: boolean) => {
      const nextInstanceUrl = targetInstanceUrl ?? instanceUrlRef.current;
      if (!nextInstanceUrl) {
        if (mountedRef.current && !background) setState("needs-instance");
        return null;
      }

      if (!mountedRef.current) return null;
      if (!background) {
        setState("loading");
        setError(null);
      }

      try {
        const results = await Promise.allSettled([
          fetchVersion(nextInstanceUrl).catch(e => { console.error("[provider] fetchVersion failed:", e); throw e; }),
          fetchInstance(nextInstanceUrl).catch(e => { console.error("[provider] fetchInstance failed:", e); throw e; }),
          fetchAllowUserServers(nextInstanceUrl).catch(e => { console.error("[provider] fetchAllowUserServers failed:", e); throw e; }),
          loadBearerToken().catch(e => { console.error("[provider] loadBearerToken failed:", e); throw e; }),
        ]);

        const failed = results.filter(r => r.status === "rejected");
        if (failed.length > 0) {
          const firstReason = (failed[0] as PromiseRejectedResult).reason;
          // Classify instance-level HTTP errors from startup queries
          if (firstReason instanceof FirepitHttpError) {
            if (firstReason.status === 404) {
              setState("instance-unreachable");
              setError("This instance does not appear to be a Firepit server.");
              return null;
            }
            if (firstReason.status >= 500) {
              setState("instance-error");
              setError("This instance is currently unavailable. Please try again later.");
              return null;
            }
          }
          throw firstReason;
        }

        const [nextVersion, nextInstance, nextFlags, nextToken] = results.map(
          (r) => (r as PromiseFulfilledResult<unknown>).value,
        ) as [VersionInfo, InstanceMetadata, FeatureFlagState, string | null];

        if (!mountedRef.current) return null;

        const nextAppwriteConfig = await persistAppwriteConfig(nextInstance);

        if (!mountedRef.current) return null;

        const nextCompatibility = evaluateCompatibility(nextVersion, nextInstance);
        let nextCurrentUser: CurrentUser | null = null;
        let nextState: ConnectionState = nextCompatibility.compatible
          ? "needs-auth"
          : "incompatible";

        if (nextCompatibility.compatible && nextToken) {
          try {
            // Skip the /api/me round-trip if the JWT is already expired
            if (isJwtExpired(nextToken)) {
              throw new Error("Token expired");
            }

            nextCurrentUser = await resolveCurrentUser(
              nextInstanceUrl,
              nextToken,
              nextAppwriteConfig,
            );

            if (!mountedRef.current) return null;

            setAccessToken(nextToken);
            setBearerTokenPresent(true);
            nextState = "ready";
          } catch (authError) {
            // Token expired. Try silent re-auth with stored credentials.
            try {
              const stored = await loadCredentials();
              if (stored) {
                const token = await authenticateWithPassword(
                  stored.email,
                  stored.password,
                  nextInstanceUrl,
                  nextAppwriteConfig,
                );

                if (!mountedRef.current) return null;

                await saveBearerToken(token);
                setAccessToken(token);
                setBearerTokenPresent(true);

                const freshUser = await resolveCurrentUser(
                  nextInstanceUrl,
                  token,
                  nextAppwriteConfig,
                );

                if (!mountedRef.current) return null;

                nextCurrentUser = freshUser;
                nextState = "ready";
              }
            } catch (reauthError) {
              console.error("[provider] Silent re-auth failed:", reauthError);
            }

            if (nextState !== "ready") {
              await clearBearerToken();
              if (!mountedRef.current) return null;
              setAccessToken(null);
              setBearerTokenPresent(false);
              nextState = "needs-auth";
              setError("Session expired. Sign in again...");
            }
          }
        } else {
          if (!mountedRef.current) return null;
          setAccessToken(null);
          setBearerTokenPresent(false);
        }

        if (!mountedRef.current) return null;

        setInstanceUrl(nextInstanceUrl);
        setVersion(nextVersion);
        setInstance(nextInstance);
        setFeatureFlags(nextFlags);
        setCompatibility(nextCompatibility);
        setCurrentUser(nextCurrentUser);
        setAppwriteConfig(nextAppwriteConfig);
        setState(nextState);

        try {
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
        } catch (snapshotError) {
            console.error("[provider] saveBootstrapSnapshot failed:", snapshotError);
            // Non-fatal: auth state is already set, snapshot failure shouldn't log the user out
        }
        return nextCompatibility;
      } catch (bootstrapError) {
        if (!mountedRef.current) return null;
        if (background) {
          console.warn("[provider] background refresh failed:", bootstrapError);
          return null;
        }
        setState("error");
        setError(toErrorMessage(bootstrapError));
        return null;
      }
    },
    [persistAppwriteConfig],
  );

  // hydrate runs once on mount. refresh is stable (only depends on persistAppwriteConfig).
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

        if (cancelled) return;

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

          // Fast path: validate session from cached state without full metadata refresh
          if (storedToken) {
            const tokenExpired = isJwtExpired(storedToken);
            const config = storedAppwriteConfig
              ? { endpoint: storedAppwriteConfig.endpoint, project: storedAppwriteConfig.project }
              : null;

            if (!tokenExpired && config) {
              try {
                const user = await resolveCurrentUser(
                  storedInstanceUrl,
                  storedToken,
                  config,
                );
                if (!cancelled) {
                  setCurrentUser(user);
                  setState("ready");
                  // Background refresh to update metadata without blocking the UI
                  void refresh(storedInstanceUrl, true);
                }
                return;
              } catch {
                // Token invalid, fall through to silent re-auth below
              }
            }
          }

          // Token missing, expired, or invalid — try silent re-auth
          if (!cancelled) {
            const clearStaleSession = async () => {
              await clearBearerToken();
              if (cancelled) return;
              setAccessToken(null);
              setBearerTokenPresent(false);
              setCurrentUser(null);
              setState("needs-auth");
              setError("Session expired. Sign in again.");
            };

            const creds = await loadCredentials();
            if (creds) {
              try {
                const config = storedAppwriteConfig
                  ? { endpoint: storedAppwriteConfig.endpoint, project: storedAppwriteConfig.project }
                  : null;
                if (!config) {
                  await clearStaleSession();
                  return;
                }
                const token = await authenticateWithPassword(
                  creds.email,
                  creds.password,
                  storedInstanceUrl,
                  config,
                );
                await saveBearerToken(token);
                setAccessToken(token);
                setBearerTokenPresent(true);
                const user = await resolveCurrentUser(
                  storedInstanceUrl,
                  token,
                  config,
                );
                setCurrentUser(user);
                setState("ready");
                void refresh(storedInstanceUrl, true);
              } catch {
                await clearStaleSession();
              }
            } else {
              await clearStaleSession();
            }
          }

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
    // refresh is stable (only persistAppwriteConfig dep). This effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Token refresh timer: Appwrite sessions expire, so periodically refresh
  // to keep the session alive. Only runs when state is "ready" (authed).
  useEffect(() => {
    if (state !== "ready") return;

    const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [refresh, state]);

  // Register for push notifications after successful auth (deferred 2s to not block startup)
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      let pushGranted = false;
      if (state === "ready" && accessToken && instanceUrl && !cancelled) {
        const token = await registerPushToken(instanceUrl, accessToken);
        pushGranted = token !== null;
      }

      if (!cancelled) {
        const stored = await loadNotificationPreferences();
        if (stored) {
          setNotificationPreferences(stored);
        } else if (pushGranted) {
          // Auto-enable push notifications when permission is granted on first launch
          await saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
          setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, accessToken, instanceUrl]);

  const bootstrapInstance = useCallback(
    async (nextInstanceUrl: string) => {
      const normalized = normalizeInstanceUrl(nextInstanceUrl);
      if (!normalized) throw new Error("Enter an instance URL to continue.");
      await saveStoredInstanceUrl(normalized);
      return refresh(normalized);
    },
    [refresh],
  );

  const setSessionToken = useCallback(
    async (token: string) => {
      const url = instanceUrlRef.current;
      if (!url) throw new Error("Set an instance URL first.");
      await saveBearerToken(token);
      setAccessToken(token);
      setBearerTokenPresent(true);
      setState("loading");
      setError(null);

      try {
        const config = appwriteConfigRef.current ?? (await resolveAppwriteConfig());
        const nextUser = await resolveCurrentUser(url, token, config);
        setCurrentUser(nextUser);
        setState("ready");

        if (version && instance && featureFlags && compatibility) {
          await saveBootstrapSnapshot(
            snapshotFromState(url, version, instance, featureFlags, compatibility, nextUser),
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
    [resolveAppwriteConfig, version, instance, featureFlags, compatibility],
  );

  const authenticate = useCallback(
    async (email: string, password: string) => {
      const url = instanceUrlRef.current;
      if (!url) throw new Error("Set an instance URL first.");
      const config = await resolveAppwriteConfig();
      const token = await authenticateWithPassword(email, password, url, config);
      await setSessionToken(token);
      // Store credentials for silent re-auth
      try {
        await storeCredentials({ email, password });
      } catch (storeErr) {
        console.error("[provider] Failed to store credentials:", storeErr);
      }
    },
    [resolveAppwriteConfig, setSessionToken],
  );

  const signOut = useCallback(async () => {
    await clearBearerToken();
    await clearCredentials();
    clearProfileCache();
    clearDmEncryptionKeyPairs();
    resetServerCache();
    setAccessToken(null);
    setBearerTokenPresent(false);
    setCurrentUser(null);
    setError(null);
    setState(instanceUrlRef.current ? "needs-auth" : "needs-instance");

    const url = instanceUrlRef.current;
    if (url && version && instance && featureFlags && compatibility) {
      await saveBootstrapSnapshot(
        snapshotFromState(url, version, instance, featureFlags, compatibility, null),
      );
    }
  }, [version, instance, featureFlags, compatibility]);

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
      appwriteConfig,
      notificationPreferences,
      customEmojis,
      saveNotificationPreferences: saveNotifPrefs,
      bootstrapInstance,
      authenticate,
      authenticateWithStoredCredentials,
      setSessionToken,
      signOut,
      resetConnection,
      refresh: async () => refresh(instanceUrlRef.current ?? undefined),
    }),
    [
      authenticate,
      bearerTokenPresent,
      bootstrapInstance,
      compatibility,
      currentUser,
      appwriteConfig,
      customEmojis,
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
