import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import type { UpdateCheckResult, UpdateSettings } from "@/lib/update/types";
import { DEFAULT_UPDATE_SETTINGS } from "@/lib/update/types";
import {
  runUpdateCheck,
  skipVersion,
  recordCheck,
  loadUpdateSettings,
  saveUpdateSettings,
} from "@/lib/update/service";
import { sendUpdateNotification, cleanupDownloadedApks } from "@/lib/update/checker";

type UpdateContextValue = {
  settings: UpdateSettings;
  checking: boolean;
  result: UpdateCheckResult | null;
  showPrompt: boolean;
  updateSettings: (partial: Partial<UpdateSettings>) => Promise<void>;
  checkNow: () => Promise<void>;
  dismissPrompt: (skipVersion: boolean) => Promise<void>;
  openSettings: () => void;
};

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UpdateSettings>({
    ...DEFAULT_UPDATE_SETTINGS,
  });
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const settingsRef = useRef(settings);
  const checkInFlightRef = useRef(false);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load settings on mount
  useEffect(() => {
    void loadUpdateSettings().then((s) => setSettings(s));
  }, []);

  // Remove leftover downloaded APKs from previous sessions. Deferred so the
  // directory scan never blocks the first frame.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const timer = setTimeout(cleanupDownloadedApks, 2000);
    return () => clearTimeout(timer);
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<UpdateSettings>) => {
      const next = { ...settingsRef.current, ...partial };
      settingsRef.current = next;
      setSettings(next);
      await saveUpdateSettings(next);
    },
    [],
  );

  const checkNow = useCallback(async () => {
    if (Platform.OS !== "android") return;
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setChecking(true);
    try {
      const checkResult = await runUpdateCheck(settingsRef.current);
      if (checkResult?.hasUpdate) {
        setResult(checkResult);

        // Auto-install if frequency permits
        if (checkResult.shouldAutoInstall) {
          // Show prompt with download option
          setShowPrompt(true);
        } else if (checkResult.shouldNotify) {
          // Send push notification
          if (checkResult.release) {
            await sendUpdateNotification(
              checkResult.release,
              checkResult.isSecurityUpdate,
            );
          }
          // Also show in-app prompt
          setShowPrompt(true);
        }
      }

      // Record that we checked, merging so concurrent settings changes win
      const updated = await recordCheck(settingsRef.current);
      setSettings((prev) => ({
        ...prev,
        lastCheckedAt: updated.lastCheckedAt,
      }));
    } catch {
      // Silently fail
    } finally {
      checkInFlightRef.current = false;
      setChecking(false);
    }
  }, []);

  // Run check on mount after settings are loaded
  const didCheckRef = useRef(false);
  useEffect(() => {
    if (didCheckRef.current) return;
    if (settings.setupComplete === false) return; // Wait for setup
    didCheckRef.current = true;
    void checkNow();
  }, [settings.setupComplete, checkNow]);

  const dismissPrompt = useCallback(
    async (skipThisVersion: boolean) => {
      setShowPrompt(false);
      if (skipThisVersion && result?.release) {
        const updated = await skipVersion(
          settingsRef.current,
          result.release.tagName,
        );
        setSettings(updated);
      }
      setResult(null);
    },
    [result],
  );

  const openSettings = useCallback(() => {
    setShowPrompt(false);
    // Navigation to settings is handled by the consumer
  }, []);

  const value = useMemo<UpdateContextValue>(
    () => ({
      settings,
      checking,
      result,
      showPrompt,
      updateSettings,
      checkNow,
      dismissPrompt,
      openSettings,
    }),
    [settings, checking, result, showPrompt, updateSettings, checkNow, dismissPrompt, openSettings],
  );

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error("useUpdate must be used within UpdateProvider");
  }
  return context;
}
