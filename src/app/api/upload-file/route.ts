import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AppwriteException, ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
    recordEvent,
} from "@/lib/newrelic-utils";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

if (ALLOWED_ORIGINS.length === 0) {
    logger.warn(
        "ALLOWED_ORIGINS is empty; upload-file route will only allow same-origin requests",
    );
}

function getAllowedOrigin(request?: Request) {
    const origin = request?.headers.get("origin");
    if (!origin) {
        return undefined;
    }

    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function isSameOrigin(request: Request, originHeader: string): boolean {
    try {
        return new URL(request.url).origin === originHeader;
    } catch {
        return false;
    }
}

function ensureAllowedRequestOrigin(request: Request): string | null {
    const origin = request.headers.get("origin");
    if (!origin) {
        return null;
    }

    if (isSameOrigin(request, origin)) {
        return null;
    }

    return ALLOWED_ORIGINS.includes(origin) ? null : origin;
}

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit, request?: Request) {
    const headers = new Headers(init?.headers);
    headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
        headers.set("Access-Control-Allow-Credentials", "true");
    }

    return NextResponse.json(data, {
        ...init,
        headers,
    });
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
    const disallowedOrigin = ensureAllowedRequestOrigin(request);
    if (disallowedOrigin) {
        return jsonResponse(
            { error: "Origin is not allowed" },
            { status: 403 },
            request,
        );
    }

    return jsonResponse({}, undefined, request);
}

// File type configurations based on roadmap specs
const FILE_TYPE_CONFIG = {
    documents: {
        mimeTypes: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
        ],
        maxSize: 10 * 1024 * 1024, // 10MB
    },
    images: {
        mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        maxSize: 5 * 1024 * 1024, // 5MB
    },
    videos: {
        mimeTypes: [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-msvideo",
            "video/x-matroska",
        ],
        maxSize: 50 * 1024 * 1024, // 50MB
    },
    audio: {
        mimeTypes: [
            "audio/mpeg",
            "audio/wav",
            "audio/ogg",
            "audio/mp4",
            "audio/flac",
        ],
        maxSize: 10 * 1024 * 1024, // 10MB
    },
    archives: {
        mimeTypes: [
            "application/zip",
            "application/x-rar-compressed",
            "application/x-7z-compressed",
            "application/x-tar",
            "application/gzip",
        ],
        maxSize: 25 * 1024 * 1024, // 25MB
    },
    code: {
        mimeTypes: [
            "application/javascript",
            "text/javascript",
            "application/typescript",
            "text/typescript",
            "text/x-python",
            "application/json",
            "text/html",
            "text/css",
            "text/xml",
            "text/markdown",
            "application/x-yaml",
        ],
        maxSize: 1 * 1024 * 1024, // 1MB
    },
};

const TEXT_BASED_MIME_TYPES = new Set([
    "text/plain",
    "text/csv",
    "application/javascript",
    "text/javascript",
    "application/typescript",
    "text/typescript",
    "text/x-python",
    "application/json",
    "text/html",
    "text/css",
    "text/xml",
    "text/markdown",
    "application/x-yaml",
]);

const ZIP_COMPATIBLE_MIME_TYPES = new Set([
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const CFBF_COMPATIBLE_MIME_TYPES = new Set([
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
]);

const MP4_FAMILY_MIME_TYPES = new Set([
    "video/mp4",
    "audio/mp4",
    "video/quicktime",
]);

const EBML_COMPATIBLE_MIME_TYPES = new Set(["video/webm", "video/x-matroska"]);

function getAppwriteErrorCode(error: unknown): number | null {
    if (!(error instanceof AppwriteException)) {
        return null;
    }

    if (typeof error.code === "number" && Number.isFinite(error.code)) {
        return error.code;
    }

    if (typeof error.code === "string") {
        const parsed = Number(error.code);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function startsWithSignature(
    sample: Buffer,
    signature: readonly number[],
    offset = 0,
): boolean {
    if (sample.length < offset + signature.length) {
        return false;
    }

    for (let index = 0; index < signature.length; index += 1) {
        if (sample[offset + index] !== signature[index]) {
            return false;
        }
    }

    return true;
}

function isLikelyTextContent(sample: Buffer): boolean {
    if (sample.length === 0) {
        return false;
    }

    // UTF-16 text often includes alternating null bytes.
    if (sample.length >= 2) {
        const isUtf16LeBom = sample[0] === 0xff && sample[1] === 0xfe;
        const isUtf16BeBom = sample[0] === 0xfe && sample[1] === 0xff;
        if (isUtf16LeBom || isUtf16BeBom) {
            return true;
        }

        const pairCount = Math.floor(sample.length / 2);
        if (pairCount > 0) {
            let evenNullCount = 0;
            let oddNullCount = 0;

            for (let index = 0; index < sample.length; index += 2) {
                if (sample[index] === 0) {
                    evenNullCount += 1;
                }
                if (index + 1 < sample.length && sample[index + 1] === 0) {
                    oddNullCount += 1;
                }
            }

            if (
                evenNullCount / pairCount > 0.3 ||
                oddNullCount / pairCount > 0.3
            ) {
                return true;
            }
        }
    }

    let suspiciousByteCount = 0;
    for (const byte of sample.values()) {
        if (byte === 0) {
            return false;
        }

        const isControl = byte < 9 || (byte > 13 && byte < 32);
        if (isControl) {
            suspiciousByteCount += 1;
        }
    }

    return suspiciousByteCount / sample.length < 0.2;
}

function detectMimeFromContent(sample: Buffer): string | null {
    if (startsWithSignature(sample, [0x89, 0x50, 0x4e, 0x47])) {
        return "image/png";
    }

    if (startsWithSignature(sample, [0xff, 0xd8, 0xff])) {
        return "image/jpeg";
    }

    if (sample.length >= 6) {
        const gifHeader = sample.subarray(0, 6).toString("ascii");
        if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
            return "image/gif";
        }
    }

    if (
        sample.length >= 12 &&
        sample.subarray(0, 4).toString("ascii") === "RIFF" &&
        sample.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }

    if (startsWithSignature(sample, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
        return "application/pdf";
    }

    if (
        sample.length >= 12 &&
        sample.subarray(4, 8).toString("ascii") === "ftyp"
    ) {
        const brand = sample.subarray(8, 12).toString("ascii").toLowerCase();
        if (brand === "qt  ") {
            return "video/quicktime";
        }

        return "video/mp4";
    }

    if (startsWithSignature(sample, [0x1a, 0x45, 0xdf, 0xa3])) {
        return "video/webm";
    }

    if (
        sample.length >= 12 &&
        sample.subarray(0, 4).toString("ascii") === "RIFF" &&
        sample.subarray(8, 12).toString("ascii") === "AVI "
    ) {
        return "video/x-msvideo";
    }

    if (startsWithSignature(sample, [0x49, 0x44, 0x33])) {
        return "audio/mpeg";
    }

    if (
        sample.length >= 2 &&
        sample[0] === 0xff &&
        (sample[1] & 0xe0) === 0xe0
    ) {
        return "audio/mpeg";
    }

    if (
        sample.length >= 12 &&
        sample.subarray(0, 4).toString("ascii") === "RIFF" &&
        sample.subarray(8, 12).toString("ascii") === "WAVE"
    ) {
        return "audio/wav";
    }

    if (startsWithSignature(sample, [0x4f, 0x67, 0x67, 0x53])) {
        return "audio/ogg";
    }

    if (startsWithSignature(sample, [0x66, 0x4c, 0x61, 0x43])) {
        return "audio/flac";
    }

    if (
        startsWithSignature(sample, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWithSignature(sample, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWithSignature(sample, [0x50, 0x4b, 0x07, 0x08])
    ) {
        return "application/zip";
    }

    if (startsWithSignature(sample, [0x1f, 0x8b, 0x08])) {
        return "application/gzip";
    }

    if (
        startsWithSignature(
            sample,
            [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
        ) ||
        startsWithSignature(
            sample,
            [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00],
        )
    ) {
        return "application/x-rar-compressed";
    }

    if (startsWithSignature(sample, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
        return "application/x-7z-compressed";
    }

    if (
        sample.length >= 265 &&
        sample.subarray(257, 262).toString("ascii") === "ustar"
    ) {
        return "application/x-tar";
    }

    if (
        startsWithSignature(
            sample,
            [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
        )
    ) {
        return "application/x-cfbf";
    }

    return null;
}

function isContentCompatibleWithDeclaredMime(
    mimeType: string,
    sample: Buffer,
): boolean {
    if (TEXT_BASED_MIME_TYPES.has(mimeType)) {
        return isLikelyTextContent(sample);
    }

    const detectedMime = detectMimeFromContent(sample);
    if (!detectedMime) {
        return false;
    }

    if (detectedMime === mimeType) {
        return true;
    }

    if (detectedMime === "application/zip") {
        return ZIP_COMPATIBLE_MIME_TYPES.has(mimeType);
    }

    if (detectedMime === "application/x-cfbf") {
        return CFBF_COMPATIBLE_MIME_TYPES.has(mimeType);
    }

    if (detectedMime === "video/mp4") {
        return MP4_FAMILY_MIME_TYPES.has(mimeType);
    }

    if (detectedMime === "video/webm") {
        return EBML_COMPATIBLE_MIME_TYPES.has(mimeType);
    }

    return false;
}

async function* toAsyncIterable(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }

            if (value) {
                yield value;
            }
        }
    } finally {
        reader.releaseLock();
    }
}

async function writeUploadToTempFile(file: File): Promise<string> {
    const tempPath = join(tmpdir(), `firepit-upload-${randomUUID()}`);
    const source = Readable.from(toAsyncIterable(file.stream()));
    const destination = createWriteStream(tempPath, { flags: "wx" });

    try {
        await pipeline(source, destination);
        return tempPath;
    } catch (error) {
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
    }
}

// Validate file type and get category
function validateFileType(
    mimeType: string,
    size: number,
): { valid: boolean; category?: string; error?: string } {
    for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
        if (config.mimeTypes.includes(mimeType)) {
            if (size > config.maxSize) {
                const maxSizeMB = config.maxSize / (1024 * 1024);
                return {
                    valid: false,
                    error: `File size exceeds maximum for ${category}: ${maxSizeMB}MB`,
                };
            }
            return { valid: true, category };
        }
    }
    return { valid: false, error: "File type not supported" };
}

/**
 * POST /api/upload-file
 * Upload a file to Appwrite Storage (supports various file types)
 *
 * Security features:
 * - Rate limiting: 10 uploads per 5 minutes per user
 * - File type validation against whitelist
 * - File size validation per category
 * - Authentication required
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return respond({ error: "Origin is not allowed" }, { status: 403 });
        }

        setTransactionName("POST /api/upload-file");

        logger.info("Starting file upload");
        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized upload attempt");
            return respond({ error: "Unauthorized" }, { status: 401 });
        }
        logger.info("Session verified", { userId: session.$id });

        addTransactionAttributes({ userId: session.$id });

        // Rate limiting: 10 uploads per 5 minutes
        const rateLimitResult = checkRateLimit(`upload:${session.$id}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000, // 5 minutes
        });

        if (!rateLimitResult.allowed) {
            logger.warn("Rate limit exceeded", {
                userId: session.$id,
                retryAfter: rateLimitResult.retryAfter,
            });
            return respond(
                {
                    error: "Too many upload requests. Please try again later.",
                    retryAfter: rateLimitResult.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter || 60),
                        "X-RateLimit-Limit": "10",
                        "X-RateLimit-Remaining": String(
                            rateLimitResult.remaining,
                        ),
                        "X-RateLimit-Reset": String(rateLimitResult.resetAt),
                    },
                },
            );
        }

        logger.info("Rate limit check passed", {
            remaining: rateLimitResult.remaining,
        });

        const env = getEnvConfig();
        logger.info("Using bucket", { bucketId: env.buckets.files });

        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            logger.warn("No file in upload request");
            return respond({ error: "No file provided" }, { status: 400 });
        }
        logger.info("File received", {
            name: file.name,
            type: file.type,
            size: file.size,
        });

        // Validate file type and size
        const validation = validateFileType(file.type, file.size);
        if (!validation.valid) {
            logger.warn("Invalid file", {
                type: file.type,
                size: file.size,
                error: validation.error,
            });
            return respond({ error: validation.error }, { status: 400 });
        }

        const contentSample = Buffer.from(
            await file.slice(0, 4096).arrayBuffer(),
        );
        if (!isContentCompatibleWithDeclaredMime(file.type, contentSample)) {
            logger.warn("File content does not match declared MIME type", {
                type: file.type,
                name: file.name,
                size: file.size,
            });
            return respond(
                {
                    error: "File content does not match declared file type",
                },
                { status: 400 },
            );
        }

        const { storage } = getServerClient();
        let tempFilePath: string | null = null;

        logger.info("Uploading to Appwrite storage", {
            category: validation.category,
        });
        const uploadStartTime = Date.now();
        const uploadedFile = await (async () => {
            try {
                tempFilePath = await writeUploadToTempFile(file);
                const uploadFile = InputFile.fromPath(tempFilePath, file.name);

                return await storage.createFile(
                    env.buckets.files,
                    ID.unique(),
                    uploadFile,
                    [
                        Permission.read(Role.user(session.$id)),
                        Permission.update(Role.user(session.$id)),
                        Permission.delete(Role.user(session.$id)),
                    ],
                );
            } finally {
                if (tempFilePath) {
                    await rm(tempFilePath, { force: true }).catch(
                        () => undefined,
                    );
                }
            }
        })();

        const uploadDuration = Date.now() - uploadStartTime;
        const fileUrl = new URL(
            `/storage/buckets/${env.buckets.files}/files/${uploadedFile.$id}/view`,
            env.endpoint,
        );
        fileUrl.searchParams.set("project", env.project);

        const downloadUrl = new URL(
            `/storage/buckets/${env.buckets.files}/files/${uploadedFile.$id}/download`,
            env.endpoint,
        );
        downloadUrl.searchParams.set("project", env.project);

        const responsePayload = {
            fileId: uploadedFile.$id,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            fileUrl: fileUrl.toString(),
            downloadUrl: downloadUrl.toString(),
            category: validation.category,
        };

        // Best-effort observability — must not change the successful response.
        try {
            trackApiCall("/api/upload-file", "POST", 200, uploadDuration, {
                operation: "uploadFile",
                fileSize: file.size,
                fileType: file.type,
                category: validation.category,
            });

            logger.info("Upload successful", {
                fileId: uploadedFile.$id,
                size: file.size,
                duration: uploadDuration,
                category: validation.category,
            });

            recordEvent("FileUpload", {
                fileId: uploadedFile.$id,
                userId: session.$id,
                fileSize: file.size,
                fileType: file.type,
                category: validation.category,
                duration: uploadDuration,
            });

            logger.info("File URL generated", { url: fileUrl.toString() });
        } catch (obsError) {
            logger.warn("Post-upload observability failed", {
                error:
                    obsError instanceof Error
                        ? obsError.message
                        : String(obsError),
            });
        }

        return respond(responsePayload);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/upload-file",
            endpoint: "/api/upload-file",
        });

        logger.error("File upload failed", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return respond({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/upload-file?fileId=xxx
 * Delete a file from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
    const startTime = Date.now();
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return respond({ error: "Origin is not allowed" }, { status: 403 });
        }

        setTransactionName("DELETE /api/upload-file");

        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized delete attempt");
            return respond({ error: "Unauthorized" }, { status: 401 });
        }

        addTransactionAttributes({ userId: session.$id });

        const env = getEnvConfig();

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            logger.warn("No fileId provided for delete");
            return respond({ error: "No fileId provided" }, { status: 400 });
        }

        addTransactionAttributes({ fileId });

        const deleteRateLimitResult = checkRateLimit(
            `upload-delete:${session.$id}`,
            {
                maxRequests: 20,
                windowMs: 5 * 60 * 1000,
            },
        );

        if (!deleteRateLimitResult.allowed) {
            logger.warn("Delete rate limit exceeded", {
                userId: session.$id,
                retryAfter: deleteRateLimitResult.retryAfter,
            });
            return respond(
                {
                    error: "Too many delete requests. Please try again later.",
                    retryAfter: deleteRateLimitResult.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(
                            deleteRateLimitResult.retryAfter || 60,
                        ),
                        "X-RateLimit-Limit": "20",
                        "X-RateLimit-Remaining": String(
                            deleteRateLimitResult.remaining,
                        ),
                        "X-RateLimit-Reset": String(
                            deleteRateLimitResult.resetAt,
                        ),
                    },
                },
            );
        }

        const { storage } = getServerClient();

        try {
            await storage.deleteFile(env.buckets.files, fileId);
        } catch (error) {
            const errorCode = getAppwriteErrorCode(error);
            if (errorCode === 404) {
                return respond({ error: "File not found" }, { status: 404 });
            }
            if (errorCode === 403) {
                return respond({ error: "Forbidden" }, { status: 403 });
            }
            throw error;
        }

        // Best-effort observability — must not change the successful response.
        try {
            trackApiCall(
                "/api/upload-file",
                "DELETE",
                200,
                Date.now() - startTime,
                {
                    operation: "deleteFile",
                    fileId,
                },
            );

            recordEvent("FileDelete", {
                fileId,
                userId: session.$id,
            });

            logger.info("File deleted", {
                fileId,
                userId: session.$id,
                duration: Date.now() - startTime,
            });
        } catch (obsError) {
            logger.warn("Post-delete observability failed", {
                error:
                    obsError instanceof Error
                        ? obsError.message
                        : String(obsError),
            });
        }

        return respond({ success: true });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "DELETE /api/upload-file",
            endpoint: "/api/upload-file",
        });

        logger.error("File delete failed", {
            error: error instanceof Error ? error.message : String(error),
        });

        return respond({ error: "Failed to delete file" }, { status: 500 });
    }
}
