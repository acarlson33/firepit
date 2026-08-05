import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "channel_read:";

export async function getLastReadAt(channelId: string): Promise<string | null> {
  return AsyncStorage.getItem(PREFIX + channelId);
}

export async function setLastReadAt(channelId: string, iso: string): Promise<void> {
  await AsyncStorage.setItem(PREFIX + channelId, iso);
}

export function countUnread(messages: { $createdAt?: string }[], lastReadAt: string | null): number {
  if (!lastReadAt) return messages.length;
  const lastReadMs = new Date(lastReadAt).getTime();
  if (Number.isNaN(lastReadMs)) return messages.length;
  let count = 0;
  for (const msg of messages) {
    if (msg.$createdAt) {
      const createdMs = new Date(msg.$createdAt).getTime();
      if (!Number.isNaN(createdMs) && createdMs > lastReadMs) count++;
    }
  }
  return count;
}
