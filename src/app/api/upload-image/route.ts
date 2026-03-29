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

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return NextResponse.json(data, {
        ...init,
        headers,
    });
}

// Handle preflight requests
export async function OPTIONS() {
    return jsonResponse({});
}

/**
 * POST /api/upload-image
 * Upload an image to Appwrite Storage
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/upload-image");

        logger.info("Starting image upload");
        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized upload attempt");
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }
        logger.info("Session verified", { userId: session.$id });

        addTransactionAttributes({ userId: session.$id });

        // Rate limiting: 10 uploads per 5 minutes
        const rateLimitResult = checkRateLimit(`upload-image:${session.$id}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000,
        });
        if (!rateLimitResult.allowed) {
            return jsonResponse(
                { error: "Too many upload requests. Please try again later." },
                { status: 429 },
            );
        }

        const env = getEnvConfig() as {
            endpoint: string;
            buckets: { images: string };
            project: string;
        };
        logger.info("Using bucket", { bucketId: env.buckets.images });

        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            logger.warn("No file in upload request");
            return jsonResponse({ error: "No file provided" }, { status: 400 });
        }
        logger.info("File received", {
            name: file.name,
            type: file.type,
            size: file.size,
        });

        // Validate file type against explicit allowlist.
        const ALLOWED_IMAGE_TYPES = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        ];
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            logger.warn("Invalid file type", { type: file.type });
            return jsonResponse(
                {
                    error: "Only JPEG, PNG, GIF, and WebP images are allowed",
                },
                { status: 400 },
            );
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            logger.warn("File too large", { size: file.size, maxSize });
            return jsonResponse(
                { error: "File size must be less than 5MB" },
                { status: 400 },
            );
        }

        const { storage } = getServerClient();

        // Convert File to InputFile for node-appwrite
        const arrayBuffer = await file.arrayBuffer();
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
        return jsonResponse({
            fileId: uploadedFile.$id,
            url: imageUrl,
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

        return jsonResponse(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/upload-image?fileId=xxx
 * Delete an image from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("DELETE /api/upload-image");

        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized delete attempt");
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }

        addTransactionAttributes({ userId: session.$id });

        const env = getEnvConfig();

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            logger.warn("No fileId provided for delete");
            return jsonResponse(
                { error: "No fileId provided" },
                { status: 400 },
            );
        }

        addTransactionAttributes({ fileId });

        const { storage } = getServerClient();

        // Verify file ownership before deleting.
        try {
            const fileMeta = await storage.getFile(env.buckets.images, fileId);
            const canDelete = fileMeta.$permissions.some(
                (p) =>
                    p.includes(`delete("user:${session.$id}")`) ||
                    p.includes(`write("user:${session.$id}")`),
            );
            if (!canDelete) {
                return jsonResponse({ error: "Forbidden" }, { status: 403 });
            }
        } catch (err) {
            if (err instanceof AppwriteException && err.code === 404) {
                return jsonResponse(
                    { error: "Image not found" },
                    { status: 404 },
                );
            }
            throw err;
        }

        const deleteStartTime = Date.now();
        await storage.deleteFile(env.buckets.images, fileId);

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

        return jsonResponse({ success: true });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "DELETE /api/upload-image",
            endpoint: "/api/upload-image",
        });

        logger.error("Image delete failed", {
            error: error instanceof Error ? error.message : String(error),
        });

        return jsonResponse(
            { error: "Failed to delete image" },
            { status: 500 },
        );
    }
}
