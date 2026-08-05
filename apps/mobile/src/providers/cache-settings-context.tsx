import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheManager, type CacheStrategy } from "@/lib/cache/CacheManager";

const CACHE_STRATEGY_KEY = "@firepit_cache_strategy";

interface CacheSettingsContextType {
  strategy: CacheStrategy;
  setStrategy: (strategy: CacheStrategy) => Promise<void>;
  cacheSize: string;
  refreshCacheSize: () => Promise<void>;
  clearCache: () => Promise<void>;
}

const CacheSettingsContext = createContext<CacheSettingsContextType>({
  strategy: "medium",
  setStrategy: async () => {},
  cacheSize: "0 B",
  refreshCacheSize: async () => {},
  clearCache: async () => {},
});

export function CacheSettingsProvider({ children }: { children: React.ReactNode }) {
  const [strategy, setStrategyState] = useState<CacheStrategy>("medium");
  const [cacheSize, setCacheSize] = useState("0 B");

  const refreshCacheSize = useCallback(async () => {
    const size = await cacheManager.getCacheSize();
    setCacheSize(cacheManager.formatSize(size));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load the stored strategy before init so caching honors the
        // saved preference from the first write.
        const saved = await AsyncStorage.getItem(CACHE_STRATEGY_KEY);
        if (cancelled) return;
        if (saved && ["aggressive", "medium", "minimal", "none"].includes(saved)) {
          const s = saved as CacheStrategy;
          setStrategyState(s);
          cacheManager.setStrategy(s);
        }
        await cacheManager.init();
        if (!cancelled) await refreshCacheSize();
      } catch {
        // cache settings are best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCacheSize]);

  const setStrategy = useCallback(async (newStrategy: CacheStrategy) => {
    setStrategyState(newStrategy);
    cacheManager.setStrategy(newStrategy);
    await AsyncStorage.setItem(CACHE_STRATEGY_KEY, newStrategy);
  }, []);

  const clearCache = useCallback(async () => {
    await cacheManager.clearCache();
    await refreshCacheSize();
  }, [refreshCacheSize]);

  return (
    <CacheSettingsContext.Provider
      value={{ strategy, setStrategy, cacheSize, refreshCacheSize, clearCache }}
    >
      {children}
    </CacheSettingsContext.Provider>
  );
}

export function useCacheSettings() {
  return useContext(CacheSettingsContext);
}
