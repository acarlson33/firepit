import {
    ATTACHMENT_MEDIA_KIND_VALUES,
    ATTACHMENT_SOURCE_VALUES,
    type AttachmentMediaKind,
    type AttachmentSource,
    type FileAttachment,
} from "@/lib/types";

const ATTACHMENT_MEDIA_KIND_SET = new Set<string>(
    ATTACHMENT_MEDIA_KIND_VALUES,
);
const ATTACHMENT_SOURCE_SET = new Set<string>(ATTACHMENT_SOURCE_VALUES);

const DEFAULT_MAX_ATTACHMENTS = 10;

type NormalizedAttachmentResult =
    | {
          ok: true;
          attachments: FileAttachment[];
      }
    | {
          ok: false;
          error: string;
      };

function normalizeString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
    const normalized = normalizeString(value);
    if (!normalized) {
        return undefined;
    }

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return undefined;
        }

        return parsed.toString();
    } catch {
        return undefined;
    }
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return undefined;
    }

    return value;
}

function normalizeMediaKind(value: unknown): AttachmentMediaKind | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    return ATTACHMENT_MEDIA_KIND_SET.has(value)
        ? (value as AttachmentMediaKind)
        : undefined;
}

function normalizeSource(value: unknown): AttachmentSource | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    return ATTACHMENT_SOURCE_SET.has(value)
        ? (value as AttachmentSource)
        : undefined;
}

function inferMediaKind(params: {
    fileType: string;
    source: AttachmentSource;
    providedMediaKind?: AttachmentMediaKind;
}): AttachmentMediaKind {
    const { fileType, source, providedMediaKind } = params;
    const normalizedFileType = fileType.toLowerCase();

    if (providedMediaKind) {
        return providedMediaKind;
    }

    if (source === "builtin_sticker" || source === "admin_sticker") {
        return "sticker";
    }

    if (
        source === "tenor" ||
        source === "giphy" ||
        normalizedFileType.includes("gif")
    ) {
        return "gif";
    }

    if (normalizedFileType.startsWith("image/")) {
        return "image";
    }

    return "generic";
}

export function normalizeFileAttachment(input: unknown): FileAttachment | null {
    if (!input || typeof input !== "object") {
        return null;
    }

    const candidate = input as Record<string, unknown>;

    const fileId = normalizeString(candidate.fileId);
    const fileName = normalizeString(candidate.fileName);
    const fileSize = normalizeNonNegativeNumber(candidate.fileSize);
    const fileType = normalizeString(candidate.fileType);
    const fileUrl = normalizeUrl(candidate.fileUrl);

    if (!fileId || !fileName || fileSize === undefined || !fileType || !fileUrl) {
        return null;
    }

    const source = normalizeSource(candidate.source) ?? "upload";
    const mediaKind = inferMediaKind({
        fileType,
        source,
        providedMediaKind: normalizeMediaKind(candidate.mediaKind),
    });
    const providerAssetId = normalizeString(candidate.providerAssetId);
    const provider =
        source === "tenor" || source === "giphy" ? source : undefined;

    return {
        fileId,
        fileName,
        fileSize,
        fileType,
        fileUrl,
        thumbnailUrl: normalizeUrl(candidate.thumbnailUrl),
        mediaKind,
        source,
        provider,
        providerAssetId,
        packId: normalizeString(candidate.packId),
        itemId: normalizeString(candidate.itemId),
        previewUrl: normalizeUrl(candidate.previewUrl),
    };
}

export function normalizeFileAttachmentsInput(
    input: unknown,
    options?: {
        maxAttachments?: number;
    },
): NormalizedAttachmentResult {
    if (input === null || input === undefined) {
        return { ok: true, attachments: [] };
    }

    if (!Array.isArray(input)) {
        return {
            ok: false,
            error: "attachments must be an array",
        };
    }

    const maxAttachments =
        options?.maxAttachments ?? DEFAULT_MAX_ATTACHMENTS;

    if (input.length > maxAttachments) {
        return {
            ok: false,
            error: `attachments cannot exceed ${maxAttachments} items`,
        };
    }

    const normalized: FileAttachment[] = [];
    for (const [index, attachment] of input.entries()) {
        const parsed = normalizeFileAttachment(attachment);
        if (!parsed) {
            return {
                ok: false,
                error: `attachments[${index}] is invalid`,
            };
        }
        normalized.push(parsed);
    }

    return { ok: true, attachments: normalized };
}

export function buildAttachmentDocumentData(params: {
    attachment: FileAttachment;
    messageId: string;
    messageType: "channel" | "dm";
}): Record<string, unknown> {
    const { attachment, messageId, messageType } = params;

    const payload: Record<string, unknown> = {
        fileId: attachment.fileId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        fileUrl: attachment.fileUrl,
        messageId,
        messageType,
        thumbnailUrl: attachment.thumbnailUrl || null,
    };

    if (attachment.mediaKind) {
        payload.mediaKind = attachment.mediaKind;
    }
    if (attachment.source) {
        payload.source = attachment.source;
    }
    if (attachment.provider) {
        payload.provider = attachment.provider;
    }
    if (attachment.providerAssetId) {
        payload.providerAssetId = attachment.providerAssetId;
    }
    if (attachment.packId) {
        payload.packId = attachment.packId;
    }
    if (attachment.itemId) {
        payload.itemId = attachment.itemId;
    }
    if (attachment.previewUrl) {
        payload.previewUrl = attachment.previewUrl;
    }

    return payload;
}

export function buildLegacyAttachmentDocumentData(params: {
    attachment: FileAttachment;
    messageId: string;
    messageType: "channel" | "dm";
}): Record<string, unknown> {
    const { attachment, messageId, messageType } = params;

    return {
        fileId: attachment.fileId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        fileUrl: attachment.fileUrl,
        messageId,
        messageType,
        thumbnailUrl: attachment.thumbnailUrl || null,
    };
}

export function isUnknownAttachmentAttributeError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { message?: unknown; type?: unknown };
    if (candidate.type === "document_invalid_structure") {
        return true;
    }

    const message =
        typeof candidate.message === "string"
            ? candidate.message.toLowerCase()
            : "";

    return (
        message.includes("unknown attribute") ||
        message.includes("invalid document structure") ||
        message.includes("attribute not found") ||
        message.includes("attribute does not exist")
    );
}
