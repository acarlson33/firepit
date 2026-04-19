import { describe, expect, it } from "vitest";

import {
    buildAttachmentDocumentData,
    buildLegacyAttachmentDocumentData,
    normalizeFileAttachment,
    normalizeFileAttachmentsInput,
} from "../lib/file-attachments";

describe("file-attachments", () => {
    it("normalizes valid upload attachment input", () => {
        const result = normalizeFileAttachmentsInput([
            {
                fileId: "file-1",
                fileName: "cat.gif",
                fileSize: 2048,
                fileType: "image/gif",
                fileUrl: "https://cdn.example.com/cat.gif",
            },
        ]);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0]).toMatchObject({
            fileId: "file-1",
            source: "upload",
            mediaKind: "gif",
        });
    });

    it("normalizes tenor attachment metadata", () => {
        const result = normalizeFileAttachment({
            fileId: "file-2",
            fileName: "party.webp",
            fileSize: 4096,
            fileType: "image/webp",
            fileUrl: "https://media.tenor.com/party.webp",
            source: "tenor",
            providerAssetId: "tenor-asset-1",
            previewUrl: "https://media.tenor.com/party-preview.webp",
        });

        expect(result).toMatchObject({
            source: "tenor",
            provider: "tenor",
            providerAssetId: "tenor-asset-1",
            mediaKind: "gif",
        });
    });

    it("normalizes giphy attachment metadata", () => {
        const result = normalizeFileAttachment({
            fileId: "file-4",
            fileName: "dance.gif",
            fileSize: 1024,
            fileType: "image/gif",
            fileUrl: "https://media.giphy.com/media/abc123/giphy.gif",
            source: "giphy",
            providerAssetId: "giphy-asset-1",
            previewUrl: "https://media.giphy.com/media/abc123/200_s.gif",
        });

        expect(result).toMatchObject({
            source: "giphy",
            provider: "giphy",
            providerAssetId: "giphy-asset-1",
            mediaKind: "gif",
        });
    });

    it("returns validation errors for invalid attachment arrays", () => {
        const notArray = normalizeFileAttachmentsInput({});
        expect(notArray).toEqual({
            ok: false,
            error: "attachments must be an array",
        });

        const invalidItem = normalizeFileAttachmentsInput([
            {
                fileId: "file-1",
            },
        ]);
        expect(invalidItem.ok).toBe(false);
        if (invalidItem.ok) {
            return;
        }

        expect(invalidItem.error).toContain("attachments[0]");
    });

    it("builds attachment document payloads", () => {
        const normalized = normalizeFileAttachment({
            fileId: "file-3",
            fileName: "sticker.png",
            fileSize: 1200,
            fileType: "image/png",
            fileUrl: "https://cdn.example.com/sticker.png",
            source: "builtin_sticker",
            packId: "starter",
            itemId: "thumbs-up",
            previewUrl: "https://cdn.example.com/sticker-preview.png",
        });

        expect(normalized).toBeTruthy();
        if (!normalized) {
            return;
        }

        const fullPayload = buildAttachmentDocumentData({
            attachment: normalized,
            messageId: "message-1",
            messageType: "channel",
        });
        const legacyPayload = buildLegacyAttachmentDocumentData({
            attachment: normalized,
            messageId: "message-1",
            messageType: "channel",
        });

        expect(fullPayload).toMatchObject({
            mediaKind: "sticker",
            source: "builtin_sticker",
            packId: "starter",
            itemId: "thumbs-up",
            previewUrl: "https://cdn.example.com/sticker-preview.png",
        });
        expect(legacyPayload).not.toHaveProperty("mediaKind");
        expect(legacyPayload).not.toHaveProperty("source");
    });
});
