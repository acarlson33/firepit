const AVATARS_BUCKET_ID = "avatars";

function buildStorageUrl(
  fileId: string | null | undefined,
  config: { endpoint: string; project: string } | null,
  bucketId: string,
): string | undefined {
  if (!fileId || !config) return undefined;
  const trimmed = fileId.trim();
  if (!trimmed) return undefined;
  const endpoint = config.endpoint.replace(/\/$/, "");
  return `${endpoint}/storage/buckets/${bucketId}/files/${encodeURIComponent(trimmed)}/view?project=${encodeURIComponent(config.project)}`;
}

/**
 * Constructs a public avatar URL from an avatar file ID using Appwrite storage.
 * Returns null if no fileId is provided or config is incomplete.
 */
export function getAvatarUrl(
    fileId: string | null | undefined,
    config: { endpoint: string; project: string } | null,
): string | undefined {
  return buildStorageUrl(fileId, config, AVATARS_BUCKET_ID);
}

const EMOJIS_BUCKET_ID = "emojis";

export function getEmojiUrl(
  fileId: string | null | undefined,
  config: { endpoint: string; project: string } | null,
): string | undefined {
  return buildStorageUrl(fileId, config, EMOJIS_BUCKET_ID);
}

/**
 * Extracts an avatar file ID from a message object.
 * The API may return avatarFileId on the message or nested in author data.
 */
export function getMessageAvatarFileId(
    message: Record<string, unknown>,
): string | undefined {
    // Direct avatarFileId on message
    if (typeof message.avatarFileId === "string" && message.avatarFileId.trim()) {
        return message.avatarFileId.trim();
    }
    // Nested in author
    const author = message.author as Record<string, unknown> | undefined;
    if (author && typeof author.avatarFileId === "string" && author.avatarFileId.trim()) {
        return author.avatarFileId.trim();
    }
    return undefined;
}
