import * as FileSystem from "expo-file-system/legacy";

export type CacheStrategy = "aggressive" | "medium" | "minimal" | "none";

const CACHE_DIR = `${FileSystem.documentDirectory}cache/`;
const IMAGES_DIR = `${CACHE_DIR}images/`;
const EMOJIS_DIR = `${CACHE_DIR}emojis/`;
const MESSAGES_DIR = `${CACHE_DIR}messages/`;

// What each strategy caches
const STRATEGY_CONFIG: Record<
  CacheStrategy,
  {
    profilePictures: boolean;
    emojis: boolean;
    messages: boolean;
    media: boolean;
  }
> = {
  aggressive: {
    profilePictures: true,
    emojis: true,
    messages: true,
    media: true,
  },
  medium: {
    profilePictures: true,
    emojis: true,
    messages: true,
    media: false,
  },
  minimal: {
    profilePictures: true,
    emojis: true,
    messages: false,
    media: false,
  },
  none: {
    profilePictures: false,
    emojis: false,
    messages: false,
    media: false,
  },
};

class CacheManager {
  private strategy: CacheStrategy = "medium";
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(force = false): Promise<void> {
    if (this.initialized && !force) return;
    if (!force && this.initPromise) return this.initPromise;
    const run = async () => {
      try {
        await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
        await FileSystem.makeDirectoryAsync(EMOJIS_DIR, { intermediates: true });
        await FileSystem.makeDirectoryAsync(MESSAGES_DIR, { intermediates: true });
        this.initialized = true;
      } finally {
        this.initPromise = null;
      }
    };
    this.initPromise = run();
    return this.initPromise;
  }

  setStrategy(strategy: CacheStrategy): void {
    this.strategy = strategy;
  }

  shouldCacheProfilePictures(): boolean {
    return STRATEGY_CONFIG[this.strategy].profilePictures;
  }

  shouldCacheEmojis(): boolean {
    return STRATEGY_CONFIG[this.strategy].emojis;
  }

  shouldCacheMessages(): boolean {
    return STRATEGY_CONFIG[this.strategy].messages;
  }

  shouldCacheMedia(): boolean {
    return STRATEGY_CONFIG[this.strategy].media;
  }

  // --- Image caching ---
  async cacheImage(url: string): Promise<string | null> {
    if (!this.shouldCacheProfilePictures() && !this.shouldCacheMedia())
      return null;
    try {
      const filename = this.sanitizeUrl(url);
      const localUri = `${IMAGES_DIR}${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) return localUri;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (result.status === 200) return localUri;
      return null;
    } catch {
      return null;
    }
  }

  async getCachedImage(url: string): Promise<string | null> {
    try {
      const filename = this.sanitizeUrl(url);
      const localUri = `${IMAGES_DIR}${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) return localUri;
      return null;
    } catch {
      return null;
    }
  }

  // --- Emoji caching ---
  async cacheEmoji(name: string, url: string): Promise<string | null> {
    if (!this.shouldCacheEmojis()) return null;
    try {
      const localUri = `${EMOJIS_DIR}${this.sanitizeUrl(name)}`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) return localUri;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (result.status === 200) return localUri;
      return null;
    } catch {
      return null;
    }
  }

  async getCachedEmoji(name: string): Promise<string | null> {
    try {
      const localUri = `${EMOJIS_DIR}${this.sanitizeUrl(name)}`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) return localUri;
      return null;
    } catch {
      return null;
    }
  }

  // --- Storage tracking ---
  async getCacheSize(): Promise<number> {
    return await this.getDirSize(CACHE_DIR);
  }

  private async getDirSize(dir: string): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return 0;
      if (!info.isDirectory) return info.size ?? 0;
      const items = await FileSystem.readDirectoryAsync(dir);
      const totals = await Promise.all(
        items.map(async (item) => {
          const itemPath = `${dir}${item}`;
          const itemInfo = await FileSystem.getInfoAsync(itemPath);
          if (itemInfo.isDirectory) {
            return this.getDirSize(`${itemPath}/`);
          }
          return (itemInfo as { size?: number }).size ?? 0;
        }),
      );
      return totals.reduce((sum, size) => sum + size, 0);
    } catch {
      return 0;
    }
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const size = (bytes / 1024 ** i).toFixed(1);
    return `${size} ${units[i]}`;
  }

  // --- Clear cache ---
  async clearCache(): Promise<void> {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    const { clearMessageCache } = await import("./MessageCache");
    await clearMessageCache();
    const { clearThreadCache } = await import("./ThreadCache");
    await clearThreadCache();
    this.initialized = false;
    await this.init(true);
  }

  // --- Helpers ---
  private sanitizeUrl(url: string): string {
    return url.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 120);
  }
}

export const cacheManager = new CacheManager();
