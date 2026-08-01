import * as SQLite from "expo-sqlite";
import { cacheManager } from "./CacheManager";

let db: SQLite.SQLiteDatabase | null = null;
let dbError = false;

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbError) return null;
  if (!db) {
    try {
      db = await SQLite.openDatabaseAsync("firepit_thread_cache.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS thread_replies (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL,
          data TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_thread_replies_parent ON thread_replies(parent_id);
        CREATE TABLE IF NOT EXISTS known_thread_parents (
          message_id TEXT PRIMARY KEY
        );
      `);
    } catch {
      dbError = true;
      console.warn("[ThreadCache] SQLite unavailable, thread caching disabled");
      return null;
    }
  }
  return db;
}

/**
 * Get all known thread reply message IDs (for bulk filtering).
 */
export async function getKnownThreadReplyIds(): Promise<Set<string>> {
  if (!cacheManager.shouldCacheMessages()) return new Set();
  const db = await getDb();
  if (!db) return new Set();
  try {
    const rows = await db.getAllAsync<{ message_id: string }>(
      "SELECT message_id FROM known_thread_parents",
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
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync(
      "INSERT OR IGNORE INTO known_thread_parents (message_id) VALUES (?)",
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
  replies: any[],
): Promise<void> {
  if (!cacheManager.shouldCacheMessages()) return;
  if (replies.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  try {
    await db.withTransactionAsync(async () => {
      for (const reply of replies) {
        const id = reply.$id ?? reply.id;
        if (!id) continue;
        await db.runAsync(
          "INSERT OR REPLACE INTO thread_replies (id, parent_id, data, cached_at) VALUES (?, ?, ?, ?)",
          id,
          parentId,
          JSON.stringify(reply),
          now,
        );
        // Also mark each reply as a known thread reply for filtering
        await db.runAsync(
          "INSERT OR IGNORE INTO known_thread_parents (message_id) VALUES (?)",
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
): Promise<any[]> {
  if (!cacheManager.shouldCacheMessages()) return [];
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.getAllAsync<{ data: string }>(
      "SELECT data FROM thread_replies WHERE parent_id = ? ORDER BY cached_at ASC",
      parentId,
    );
    return rows.map((row) => JSON.parse(row.data));
  } catch {
    return [];
  }
}

/**
 * Clear all thread cache.
 */
export async function clearThreadCache(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync("DELETE FROM thread_replies");
    await db.runAsync("DELETE FROM known_thread_parents");
  } catch {
    // ignore
  }
}
