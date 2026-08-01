import * as SQLite from "expo-sqlite";
import { cacheManager } from "./CacheManager";

let db: SQLite.SQLiteDatabase | null = null;
let dbError = false;
let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

async function initDb(): Promise<SQLite.SQLiteDatabase | null> {
  try {
    const database = await SQLite.openDatabaseAsync("firepit_cache.db");
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    `);
    return database;
  } catch {
    dbError = true;
    console.warn("[Cache] SQLite unavailable, message caching disabled");
    return null;
  }
}

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbError) return null;
  if (db) return db;
  if (!dbPromise) dbPromise = initDb();
  db = await dbPromise;
  return db;
}

export async function cacheMessages(
  conversationId: string,
  messages: any[],
): Promise<void> {
  if (!cacheManager.shouldCacheMessages()) return;
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  try {
    await db.withTransactionAsync(async () => {
      for (const msg of messages) {
        await db.runAsync(
          "INSERT OR REPLACE INTO messages (id, conversation_id, data, cached_at) VALUES (?, ?, ?, ?)",
          msg.$id,
          conversationId,
          JSON.stringify(msg),
          now,
        );
      }
      // Prune stale entries no longer in the fetched set
      const ids = messages.map((m: any) => m.$id).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await db.runAsync(
          `DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (${placeholders})`,
          conversationId,
          ...ids,
        );
      }
    });
  } catch {
    // ignore cache write failures
  }
}

export async function getCachedMessages(
  conversationId: string,
): Promise<any[]> {
  if (!cacheManager.shouldCacheMessages()) return [];
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.getAllAsync(
      "SELECT data FROM messages WHERE conversation_id = ?",
      conversationId,
    );
    const messages = rows.map((row: any) => JSON.parse(row.data));
    messages.sort((a: any, b: any) => {
      const ta = a.$createdAt ? new Date(a.$createdAt).getTime() : 0;
      const tb = b.$createdAt ? new Date(b.$createdAt).getTime() : 0;
      return tb - ta;
    });
    return messages;
  } catch {
    return [];
  }
}

export async function clearMessageCache(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync("DELETE FROM messages");
  } catch {
    // ignore
  }
}
