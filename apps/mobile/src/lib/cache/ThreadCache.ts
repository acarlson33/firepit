import * as SQLite from "expo-sqlite";
import { cacheManager } from "./CacheManager";
import type { TimelineMessage } from "@/lib/firepit";

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
let dbError = false;

function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbError) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const database = await SQLite.openDatabaseAsync("firepit_thread_cache.db");
        await database.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS thread_replies (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            data TEXT NOT NULL,
            cached_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_thread_replies_parent ON thread_replies(parent_id);
          CREATE TABLE IF NOT EXISTS known_thread_replies (
            message_id TEXT PRIMARY KEY
          );
        `);
        const legacy = await database.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'known_thread_parents'",
        );
        if (legacy.length > 0) {
          await database.execAsync(`
            INSERT OR IGNORE INTO known_thread_replies (message_id)
              SELECT message_id FROM known_thread_parents;
            DROP TABLE known_thread_parents;
          `);
        }
        return database;
      } catch {
        dbError = true;
        console.warn("[ThreadCache] SQLite unavailable, thread caching disabled");
        return null;
      }
    })();
  }
  return dbPromise;
}

/**
 * Get all known thread reply message IDs (for bulk filtering).
 */
export async function getKnownThreadReplyIds(): Promise<Set<string>> {
  if (!cacheManager.shouldCacheMessages()) return new Set();
  const database = await getDb();
  if (!database) return new Set();
  try {
    const rows = await database.getAllAsync<{ message_id: string }>(
      "SELECT message_id FROM known_thread_replies",
    );
    return new Set(rows.map((r) => r.message_id));
  } catch {
    return new Set();
  }
}

/**
 * Mark a message as a thread reply so it can be filtered from the main list.
 */
export async function markAsThreadReply(messageId: string): Promise<void> {
  if (!cacheManager.shouldCacheMessages()) return;
  const database = await getDb();
  if (!database) return;
  try {
    await database.runAsync(
      "INSERT OR IGNORE INTO known_thread_replies (message_id) VALUES (?)",
      messageId,
    );
  } catch {
    // ignore
  }
}

/**
 * Cache thread replies for a parent message.
 */
export async function cacheThreadReplies(
  parentId: string,
  replies: TimelineMessage[],
): Promise<void> {
  if (!cacheManager.shouldCacheMessages()) return;
  if (replies.length === 0) return;
  const database = await getDb();
  if (!database) return;
  const now = Date.now();
  try {
    await database.withTransactionAsync(async () => {
      for (const reply of replies) {
        const rawId =
          reply.$id ?? (reply as TimelineMessage & { id?: string }).id;
        if (!rawId) continue;
        const id: string = rawId;
        await database.runAsync(
          "INSERT OR REPLACE INTO thread_replies (id, parent_id, data, cached_at) VALUES (?, ?, ?, ?)",
          id,
          parentId,
          JSON.stringify(reply),
          now,
        );
        // Also mark each reply as a known thread reply for filtering
        await database.runAsync(
          "INSERT OR IGNORE INTO known_thread_replies (message_id) VALUES (?)",
          id,
        );
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Get cached thread replies for a parent message.
 */
export async function getCachedThreadReplies(
  parentId: string,
): Promise<TimelineMessage[]> {
  if (!cacheManager.shouldCacheMessages()) return [];
  const database = await getDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<{ data: string }>(
      "SELECT data FROM thread_replies WHERE parent_id = ? ORDER BY cached_at ASC",
      parentId,
    );
    return rows.map((row) => JSON.parse(row.data) as TimelineMessage);
  } catch {
    return [];
  }
}

/**
 * Clear all thread cache.
 */
export async function clearThreadCache(): Promise<void> {
  const database = await getDb();
  if (!database) return;
  try {
    await database.runAsync("DELETE FROM thread_replies");
    await database.runAsync("DELETE FROM known_thread_replies");
  } catch {
    // ignore
  }
}
