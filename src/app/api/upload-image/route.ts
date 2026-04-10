import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AppwriteException, ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
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

const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
] as const;
const ALLOWED_IMAGE_TYPE_SET = new Set<string>(ALLOWED_IMAGE_TYPES);

if (ALLOWED_ORIGINS.length === 0) {
    logger.warn(
        "ALLOWED_ORIGINS is empty; upload-image route will only allow same-origin requests",
    );
}

function getAllowedOrigin(request?: Request) {
    const origin = request?.headers.get("origin");
    if (!origin) {
        return undefined;
    }

    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function hasPrefix(bytes: Uint8Array, signature: number[]) {
    return signature.every((value, index) => bytes[index] === value);
}

function matchesImageSignature(mimeType: string, bytes: Uint8Array) {
    if (mimeType === "image/jpeg") {
        return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
    } else if (mimeType === "image/png") {
        return hasPrefix(
            bytes,
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        );
    } else if (mimeType === "image/gif") {
        return hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38]);
    } else if (mimeType === "image/webp") {
        if (bytes.length < 12) {
            return false;
        }

        return (
            hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
        );
    }

    return false;
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
    return jsonResponse({}, undefined, request);
}

/**
 * POST /api/upload-image
 * Upload an image to Appwrite Storage
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        setTransactionName("POST /api/upload-image");

        logger.info("Starting image upload");
        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized upload attempt");
            return respond({ error: "Unauthorized" }, { status: 401 });
        }
        logger.info("Session verified", { userId: session.$id });

        addTransactionAttributes({ userId: session.$id });

        // Rate limiting: 10 uploads per 5 minutes
        const rateLimitResult = checkRateLimit(`upload-image:${session.$id}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000,
        });
        if (!rateLimitResult.allowed) {
            return respond(
                { error: "Too many upload requests. Please try again later." },
                { status: 429 },
            );
        }

        const env = getEnvConfig();
        logger.info("Using bucket", { bucketId: env.buckets.images });

        // Validate request content before parsing body.
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
            return respond(
                { error: "Expected multipart/form-data" },
                { status: 400 },
            );
        }

        const contentLength = Number(request.headers.get("content-length"));
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (Number.isFinite(contentLength) && contentLength > maxSize) {
            return respond(
                { error: "File size must be less than 5MB" },
                { status: 413 },
            );
        }

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

        // Validate file type against explicit allowlist.
        if (!ALLOWED_IMAGE_TYPE_SET.has(file.type)) {
            logger.warn("Invalid file type", { type: file.type });
            return respond(
                {
                    error: "Only JPEG, PNG, GIF, and WebP images are allowed",
                },
                { status: 400 },
            );
        }

        // Validate file size (max 5MB)
        if (file.size > maxSize) {
            logger.warn("File too large", { size: file.size, maxSize });
            return respond(
                { error: "File size must be less than 5MB" },
                { status: 413 },
            );
        }

        const { storage } = getServerClient();

        // Convert File to InputFile for node-appwrite
        const arrayBuffer = await file.arrayBuffer();
        const signatureBytes = new Uint8Array(arrayBuffer.slice(0, 16));
        if (!matchesImageSignature(file.type, signatureBytes)) {
            logger.warn("Image signature mismatch", {
                name: file.name,
                type: file.type,
                userId: session.$id,
            });
            return respond(
                {
                    error: "Only JPEG, PNG, GIF, and WebP images are allowed",
                },
                { status: 400 },
            );
        }

        const uploadFile = InputFile.fromBuffer(
            Buffer.from(arrayBuffer),
            file.name,
        );

        logger.info("Uploading to Appwrite storage");
        const uploadStartTime = Date.now();

        // Upload to Appwrite Storage
        const uploadedFile = await storage.createFile(
            env.buckets.images,
            ID.unique(),
            uploadFile,
            [
                Permission.read(Role.any()),
                Permission.update(Role.user(session.$id)),
                Permission.delete(Role.user(session.$id)),
            ],
        );

        const uploadDuration = Date.now() - uploadStartTime;

        // Best-effort observability — must not change the successful response.
        const imageUrl = `${env.endpoint}/storage/buckets/${env.buckets.images}/files/${uploadedFile.$id}/view?project=${env.project}`;
        try {
            trackApiCall("/api/upload-image", "POST", 200, uploadDuration, {
                operation: "uploadFile",
                fileSize: file.size,
                fileType: file.type,
            });

            logger.info("Upload successful", {
                fileId: uploadedFile.$id,
                size: file.size,
                duration: uploadDuration,
            });

            recordEvent("ImageUpload", {
                fileId: uploadedFile.$id,
                userId: session.$id,
                fileSize: file.size,
                fileType: file.type,
                duration: uploadDuration,
            });

            logger.info("Image URL generated", { url: imageUrl });
        } catch (obsError) {
            logger.warn("Post-upload observability failed", {
                error:
                    obsError instanceof Error
                        ? obsError.message
                        : String(obsError),
            });
        }
        return respond({
            fileId: uploadedFile.$id,
            fileUrl: imageUrl,
        });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/upload-image",
            endpoint: "/api/upload-image",
        });

        logger.error("Image upload failed", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return respond({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/upload-image?fileId=xxx
 * Delete an image from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
    const startTime = Date.now();
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        setTransactionName("DELETE /api/upload-image");

        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized delete attempt");
            return respond({ error: "Unauthorized" }, { status: 401 });
        }

        const rateLimitResult = checkRateLimit(`delete-image:${session.$id}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000,
        });
        if (!rateLimitResult.allowed) {
            return respond(
                { error: "Too many delete requests. Please try again later." },
                { status: 429 },
            );
        }

        addTransactionAttributes({ userId: session.$id });

        const env = getEnvConfig();

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            logger.warn("No fileId provided for delete");
            return respond({ error: "No fileId provided" }, { status: 400 });
        }

        if (!APPWRITE_ID_PATTERN.test(fileId)) {
            logger.warn("Invalid fileId provided for delete", { fileId });
            return respond({ error: "Invalid fileId" }, { status: 400 });
        }

        addTransactionAttributes({ fileId });

        const { storage } = getServerClient();
        const deleteStartTime = Date.now();

        try {
            await storage.deleteFile(env.buckets.images, fileId);
        } catch (error) {
            if (error instanceof AppwriteException && error.code === 404) {
                return respond({ error: "Image not found" }, { status: 404 });
            }
            if (error instanceof AppwriteException && error.code === 403) {
                return respond({ error: "Forbidden" }, { status: 403 });
            }
            throw error;
        }

        // Best-effort observability — must not change the successful response.
        try {
            trackApiCall(
                "/api/upload-image",
                "DELETE",
                200,
                Date.now() - deleteStartTime,
                { operation: "deleteFile", fileId },
            );

            recordEvent("ImageDelete", {
                fileId,
                userId: session.$id,
            });

            logger.info("Image deleted", {
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
            context: "DELETE /api/upload-image",
            endpoint: "/api/upload-image",
        });

        logger.error("Image delete failed", {
            error: error instanceof Error ? error.message : String(error),
        });

        return respond({ error: "Failed to delete image" }, { status: 500 });
    }
}
