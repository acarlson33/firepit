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

  async init(force = false): Promise<void> {
    if (this.initialized && !force) return;
    await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
    await FileSystem.makeDirectoryAsync(EMOJIS_DIR, { intermediates: true });
    await FileSystem.makeDirectoryAsync(MESSAGES_DIR, { intermediates: true });
    this.initialized = true;
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
      const localUri = `${EMOJIS_DIR}${name}`;
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
      const localUri = `${EMOJIS_DIR}${name}`;
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
      let total = 0;
      for (const item of items) {
        const itemPath = `${dir}${item}`;
        const itemInfo = await FileSystem.getInfoAsync(itemPath);
        if (itemInfo.isDirectory) {
          total += await this.getDirSize(`${itemPath}/`);
        } else if ((itemInfo as { size?: number }).size) {
          total += (itemInfo as { size: number }).size;
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
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
