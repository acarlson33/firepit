import * as SQLite from "expo-sqlite";
import { cacheManager } from "./CacheManager";
import type { TimelineMessage } from "@/lib/firepit";

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
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

type CacheableMessage = { $id?: string };

export async function cacheMessages(
  conversationId: string,
  messages: CacheableMessage[],
): Promise<void> {
  if (!cacheManager.shouldCacheMessages()) return;
  const database = await getDb();
  if (!database) return;
  const now = Date.now();
  try {
    await database.withTransactionAsync(async () => {
      for (const msg of messages) {
        if (!msg.$id) continue;
        await database.runAsync(
          "INSERT OR REPLACE INTO messages (id, conversation_id, data, cached_at) VALUES (?, ?, ?, ?)",
          msg.$id,
          conversationId,
          JSON.stringify(msg),
          now,
        );
      }
      // Prune stale entries no longer in the fetched set
      const ids = messages
        .map((m) => m.$id)
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await database.runAsync(
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
): Promise<TimelineMessage[]> {
  if (!cacheManager.shouldCacheMessages()) return [];
  const database = await getDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync(
      "SELECT data FROM messages WHERE conversation_id = ?",
      conversationId,
    );
    const messages = rows.map(
      (row) => JSON.parse((row as { data: string }).data) as TimelineMessage,
    );
    messages.sort((a, b) => {
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
  const database = await getDb();
  if (!database) return;
  try {
    await database.runAsync("DELETE FROM messages");
  } catch {
    // ignore
  }
}
